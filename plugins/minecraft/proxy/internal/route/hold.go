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
	msgNotLinked  = "Your Minecraft account is not linked to Discord, and a link code could not be issued right now. Try again in a moment."
	msgNoAccess   = "You do not have access to any server on this proxy."
	msgAuthFailed = "Mojang could not verify your session. Restart your launcher and try again."
)

// handleLogin runs everything from Login Start to either a backend tunnel or a
// hold. It is the one place that decides what happens to a player.
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

	sess, err := p.opts.Control.Session(ctx, profile.ID.String(), profile.Name, ip, hs.Protocol)
	if err != nil {
		return fmt.Errorf("session lookup for %s: %w", profile.Name, err)
	}

	if !sess.Linked {
		// The bot removes unlinked players on its own once they are in game, so
		// letting one through only to have them ejected is worse than stopping
		// them here, where the message is the first thing they read — and where
		// it can carry the code they need to fix it.
		return disconnectLogin(conn, p.linkInstructions(ctx, profile))
	}
	if len(sess.Servers) == 0 {
		return disconnectLogin(conn, msgNoServers)
	}
	if len(accessibleIDs(sess)) == 0 {
		return disconnectLogin(conn, msgNoAccess)
	}

	target, online := p.chooseTarget(sess, cleanHost(hs.Host))

	if online {
		entry, ok := p.entryFor(target)
		if !ok {
			return fmt.Errorf("server %d vanished between decision and connect", target)
		}
		p.log.Info("routing player", "player", profile.Name, "server", entry.Tag)
		return p.joinBackend(ctx, conn, hs, entry, profile, ip)
	}

	if !mcver.CanBeHeld(hs.Protocol) {
		return disconnectLogin(conn, msgCannotHold)
	}
	return p.hold(ctx, conn, hs, target, profile, ip)
}

// linkInstructions builds the disconnect message an unlinked player gets.
//
// A player who has never linked their account cannot be helped by waiting, so
// they are told to link instead. Issuing the code here and putting it straight
// into the disconnect text is the only way to reach them: the login phase has
// no chat, and this message is the one thing every client version will display.
func (p *Proxy) linkInstructions(ctx context.Context, profile *auth.Profile) string {
	res, err := p.opts.Control.BeginLink(ctx, profile.ID.String(), profile.Name)
	if err != nil {
		if errors.Is(err, control.ErrAlreadyLinked) {
			// The link landed between the session lookup and now.
			return "Your account is already linked. Join again."
		}
		p.log.Warn("link code request failed", "player", profile.Name, "error", err)
		return msgNotLinked
	}

	minutes := res.ExpiresInSeconds / 60
	if minutes < 1 {
		minutes = 1
	}
	return fmt.Sprintf(
		"Your Minecraft account is not linked to Discord yet.\n\nRun /linkcode %s on Discord within %d minutes, then join again.",
		res.Code, minutes)
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
	return ids[0], false
}

// hold parks a player mid-login until their server is up, then joins them to it
// as though they had never waited.
//
// Nothing has been sent past the encryption exchange, so the client stays on
// its own connecting screen: it is never kicked, never shown an error, and
// never asked to reconnect. What it cannot be shown is a message, so the proxy
// acts for the player instead, raising the start request on their behalf.
func (p *Proxy) hold(
	ctx context.Context,
	conn *protocol.Conn,
	hs *handshake,
	target int,
	profile *auth.Profile,
	ip string,
) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	label := strconv.Itoa(target)
	if entry, ok := p.entryFor(target); ok && entry.Tag != "" {
		label = entry.Tag
	}
	p.log.Info("holding player", "player", profile.Name, "server", label, "protocol", hs.Protocol)

	res, err := p.opts.Control.Start(ctx, profile.ID.String(), profile.Name, target)
	switch {
	case err != nil:
		p.log.Warn("start request failed", "player", profile.Name, "error", err)
	case res.Status == control.StatusNoAccess || res.Status == control.StatusNotLinked:
		return disconnectLogin(conn, res.Message)
	default:
		p.log.Info("start requested",
			"player", profile.Name, "server", label, "status", res.Status, "message", res.Message)
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
	return p.joinBackend(ctx, conn, hs, entry, profile, ip)
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
