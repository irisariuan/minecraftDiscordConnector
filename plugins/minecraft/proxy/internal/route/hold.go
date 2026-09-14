package route

import (
	"context"
	"errors"
	"fmt"
	"net"
	"strconv"
	"time"

	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/auth"
	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/control"
	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/mcver"
	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/protocol"
)

// Messages shown to a player the proxy cannot help. They are deliberately
// plain: somebody who cannot get in wants to know why and what to do next.
const (
	msgNoServers  = "No servers are set up on this proxy yet. Ask an administrator to add one."
	msgTooOld     = "This client is too old to connect. Minecraft 1.7.2 or newer is required."
	msgCannotHold = "No server is running right now, and your client is too old to be held while one starts. Start the server from Discord, then join again."
	msgNoAccess   = "You do not have access to any server on this proxy."
	msgAuthFailed = "Mojang could not verify your session. Restart your launcher and try again."
	// Shown when a backend is still in online mode. The player cannot fix it,
	// so the message is written to be repeated to whoever can.
	msgBackendOnlineMode = "That server is not set up to run behind this proxy: it still has online-mode=true. Ask an administrator to set online-mode=false in its server.properties."
)

// handleLogin runs everything from Login Start to a backend, a waiting world or
// a hold. It is the one place that decides what happens to a player.
func (p *Proxy) handleLogin(ctx context.Context, conn *protocol.Conn, raw net.Conn, hs *handshake) error {
	if hs.Protocol < mcver.MinSupported {
		return disconnectLogin(conn, msgTooOld)
	}

	ls, err := readLoginStart(conn, hs.Protocol)
	if err != nil {
		return err
	}

	ip := clientIP(raw)
	profile, err := p.authenticate(ctx, conn, hs.Protocol, ls, ip)
	if err != nil {
		if errors.Is(err, auth.ErrNotAuthenticated) {
			return disconnectLogin(conn, msgAuthFailed)
		}
		return fmt.Errorf("authenticate %s: %w", ls.Name, err)
	}

	// Past this point a player may wait for as long as they are willing to.
	// The login deadline has to go, and liveness becomes the hold loop's job.
	_ = raw.SetDeadline(time.Time{})

	p.sessions.Add(1)
	defer p.sessions.Add(-1)

	player := playerIdentity(profile, ip, hs.Protocol)

	sess, err := p.opts.Control.Session(ctx, player)
	if err != nil {
		return fmt.Errorf("session lookup for %s: %w", profile.Name, err)
	}

	host := cleanHost(hs.Host)
	d := p.decide(sess, host, hs.Protocol, 0)

	// A player is only asked about a stored choice when they are about to be
	// asked to choose, which is the only situation where the answer changes
	// anything — and is exactly the situation a player returning from the
	// waiting world arrives in. Asking every login instead would put a round
	// trip in front of every join for the sake of one that rarely happens.
	if d.Plan == planWorld {
		if chosen := p.readChoice(conn, hs.Protocol); chosen != 0 {
			d = p.decide(sess, host, hs.Protocol, chosen)
		}
	}
	p.log.Info("routing player",
		"player", profile.Name, "plan", d.Plan, "reason", d.Reason, "protocol", hs.Protocol)

	switch d.Plan {
	case planRefuse:
		return disconnectLogin(conn, d.Message)

	case planJoin:
		entry, ok := p.entryFor(d.Server)
		if !ok {
			return fmt.Errorf("server %d vanished between decision and connect", d.Server)
		}
		return p.joinBackend(ctx, conn, hs, entry, profile, ip)

	case planWorld:
		return p.serveWorld(ctx, conn, hs, profile, player, sess)

	default:
		return p.hold(ctx, conn, hs, d.Server, profile, player, sess.Linked)
	}
}

// playerIdentity builds what the bot is told about a verified player.
//
// Both identities travel because a player can be known by two at once. The
// proxy is the online-mode authority, so the Mojang UUID is who they really
// are; but a backend behind `forwarding: none` runs offline and knows them by
// the UUID it derives from their name instead. That second identity is the one
// anything inside such a backend reports — the connector plugin's `/link`
// included — so a player who linked in game would look like a stranger here
// without it.
//
// It is derived from the *verified* name, never the name the client claimed:
// offline UUIDs are case-sensitive, Mojang returns the canonical spelling, and
// deriving from anything else would produce a UUID no backend ever uses.
// Deriving it from the verified name is also what makes it safe to act on —
// claiming somebody else's offline identity would mean owning their account.
func playerIdentity(profile *auth.Profile, ip string, protocolVersion int32) control.Player {
	return control.Player{
		UUID:        profile.ID.String(),
		OfflineUUID: protocol.OfflineUUID(profile.Name).String(),
		Name:        profile.Name,
		IP:          ip,
		Protocol:    protocolVersion,
	}
}

// chooseTarget picks the server a player is routed to, and reports whether it
// is already running.
//
// Precedence is: the hostname the player connected with, then any server that
// is already running, then the only server they can use at all. Anything still
// ambiguous falls back to the lowest id, which is at least stable across
// reconnects rather than arbitrary.
func (p *Proxy) chooseTarget(sess *control.Session, host string) (int, bool) {
	statusOf := make(map[int]bool, len(sess.Servers))
	for _, srv := range sess.Servers {
		if srv.Accessible {
			statusOf[srv.ID] = srv.Online
		}
	}

	if id, ok := forcedHost(host, sess.Servers); ok {
		return id, statusOf[id]
	}

	if up := onlineAccessibleIDs(sess); len(up) > 0 {
		return up[0], true
	}
	ids := accessibleIDs(sess)
	if len(ids) == 0 {
		// handleLogin rejects this case before calling here, but the guard
		// belongs with the indexing rather than in the caller: a second caller
		// added later would otherwise inherit a panic. Zero is not a valid
		// server id, so it cannot be mistaken for a real target.
		return 0, false
	}
	return ids[0], false
}

// hold parks a player mid-login until their server is up, then joins them to it
// as though they had never waited.
//
// Nothing has been sent past the encryption exchange, so the client stays on
// its own connecting screen: it is never kicked, never shown an error, and
// never asked to reconnect. What it cannot be shown is a message, so where it
// can the proxy acts for the player instead, raising the start request on their
// behalf.
func (p *Proxy) hold(
	ctx context.Context,
	conn *protocol.Conn,
	hs *handshake,
	target int,
	profile *auth.Profile,
	player control.Player,
	linked bool,
) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	label := strconv.Itoa(target)
	if entry, ok := p.entryFor(target); ok && entry.Tag != "" {
		label = entry.Tag
	}
	p.log.Info("holding player", "player", profile.Name, "server", label, "protocol", hs.Protocol)

	// Asking for a server to be started is gated on a linked Discord account:
	// the bot has to know whose permission to check and whose credit to charge.
	// A player without one simply waits, rather than being turned away for it.
	if linked {
		res, err := p.opts.Control.Start(ctx, player, target)
		switch {
		case err != nil:
			p.log.Warn("start request failed", "player", profile.Name, "error", err)
		case res.Status == control.StatusNoAccess:
			return disconnectLogin(conn, res.Message)
		default:
			p.log.Info("start requested",
				"player", profile.Name, "server", label, "status", res.Status, "message", res.Message)
		}
	} else {
		p.log.Info("holding an unlinked player; not requesting a start",
			"player", profile.Name, "server", label)
	}

	online := make(chan struct{})
	go func() {
		defer close(online)
		_ = p.opts.Poller.WaitOnline(ctx, target)
	}()

	if err := p.keepAliveUntil(ctx, conn, online); err != nil {
		return err
	}
	if ctx.Err() != nil {
		return ctx.Err()
	}

	entry, ok := p.entryFor(target)
	if !ok {
		return fmt.Errorf("server %d disappeared while holding", target)
	}
	// "The process started" and "the port is open" are different moments.
	if err := p.awaitBackendAccepting(ctx, entry); err != nil {
		return err
	}

	p.log.Info("hold resolved", "player", profile.Name, "server", entry.Tag)
	return p.joinBackend(ctx, conn, hs, entry, profile, player.IP)
}

// awaitBackendAccepting waits for a backend to accept TCP connections.
func (p *Proxy) awaitBackendAccepting(ctx context.Context, entry control.ServerEntry) error {
	addr := net.JoinHostPort(entry.Host, strconv.Itoa(entry.Port))
	backoff := 500 * time.Millisecond
	for {
		dialer := net.Dialer{Timeout: 2 * time.Second}
		c, err := dialer.DialContext(ctx, "tcp", addr)
		if err == nil {
			_ = c.Close()
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(backoff):
		}
		if backoff < 5*time.Second {
			backoff *= 2
		}
	}
}
