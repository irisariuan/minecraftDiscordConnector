package route

import (
	"context"
	"fmt"
	"io"
	"net"
	"strconv"
	"sync"
	"time"

	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/auth"
	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/control"
	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/forward"
	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/limbo"
	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/mcver"
	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/protocol"
)

// Packet ids the backend may send during login.
const (
	idLoginPluginRequest  = 0x04
	idLoginPluginResponse = 0x02
)

// backendDialTimeout bounds the TCP connect to a backend. A backend that has
// only just been started may refuse connections for a moment, so callers retry
// rather than treating one failure as fatal.
const backendDialTimeout = 10 * time.Second

// writeLoginStart sends Login Start to the backend in the layout its protocol
// version expects. The proxy speaks the client's protocol to the backend, so
// the same version branching that applied when reading applies when writing.
func writeLoginStart(conn *protocol.Conn, proto int32, name string, id protocol.UUID) error {
	w := protocol.NewWriter(idLoginStart).String(name)

	if mcver.LoginStartHasSignature(proto) {
		// No chat-signing key is relayed, so the optional block is absent.
		w = w.Bool(false)
	}
	switch {
	case proto >= mcver.V1_20_2:
		w = w.UUID(id)
	case mcver.LoginStartHasOptionalUUID(proto):
		w = w.Bool(true).UUID(id)
	}

	return conn.WritePacket(w.Packet())
}

// joinBackend opens a connection to a backend, replays the login on the
// player's behalf and then joins the two connections together.
//
// The backend is in offline mode: it will not challenge the player, so the
// identity the proxy verified is passed down by the configured forwarding
// scheme and the backend's Login Success is relayed to the client untouched.
// Because the proxy also relays the backend's Set Compression verbatim, both
// links end up on the same compression threshold, which is what makes the
// byte-level tunnel at the end of this function correct.
func (p *Proxy) joinBackend(
	ctx context.Context,
	client *protocol.Conn,
	hs *handshake,
	entry control.ServerEntry,
	profile *auth.Profile,
	ip string,
) error {
	mode, err := forward.ParseMode(entry.Forwarding)
	if err != nil {
		return fmt.Errorf("server %d: %w", entry.ID, err)
	}

	identity := forward.Identity{
		UUID:       profile.ID,
		Name:       profile.Name,
		ClientIP:   ip,
		Properties: profile.Properties,
	}

	addr := net.JoinHostPort(entry.Host, strconv.Itoa(entry.Port))
	dialer := net.Dialer{Timeout: backendDialTimeout}
	raw, err := dialer.DialContext(ctx, "tcp", addr)
	if err != nil {
		return fmt.Errorf("dial backend %s: %w", addr, err)
	}
	backend := protocol.NewConn(raw)
	defer backend.Close()

	// The address field carries the forwarding payload for BungeeCord, and the
	// plain hostname otherwise.
	host := cleanHost(hs.Host)
	if mode == forward.ModeBungeeCord {
		host, err = forward.BungeeAddress(host, identity)
		if err != nil {
			return fmt.Errorf("build forwarding address: %w", err)
		}
	}

	hsPkt := protocol.NewWriter(0x00).
		VarInt(hs.Protocol).
		String(host).
		UShort(uint16(entry.Port)).
		VarInt(stateLogin).
		Packet()
	if err := backend.WritePacket(hsPkt); err != nil {
		return fmt.Errorf("send handshake to backend: %w", err)
	}
	if err := writeLoginStart(backend, hs.Protocol, profile.Name, profile.ID); err != nil {
		return fmt.Errorf("send login start to backend: %w", err)
	}

	if err := p.relayBackendLogin(backend, client, mode, entry, identity); err != nil {
		return err
	}

	// A join to a running server is the only chance the proxy ever gets to see
	// what a client of this version needs before it will enter a world. When it
	// does not already know, it watches this one go past.
	if p.shouldRecord(hs.Protocol) {
		// The recording is filed by recordJoin itself, as soon as it is taken.
		// What comes back here arrives only when the player leaves.
		_, err := p.recordJoin(client, backend, hs.Protocol, entry)
		return err
	}

	p.tunnel(client, backend)
	return nil
}

// snapshotFreshness is how long a recording is used before the next join at
// that version is watched again.
//
// A backend's registry set is not fixed: a data pack, a mod or a game update
// changes it, and a recording made before such a change describes a world the
// backend no longer has. Nothing here can detect that, so it is re-taken on a
// timer instead. A day is long enough that the cost — one join per version
// carrying the full registry set rather than an abbreviated one — is paid
// rarely, and short enough that a change made on a Monday is not still being
// replayed on a Friday.
const snapshotFreshness = 24 * time.Hour

// shouldRecord reports whether this join is worth watching.
//
// Recording costs the joining player a larger registry set than they would
// otherwise receive, because the proxy stops their client telling the backend
// which parts it already has. That is a real cost to a real person, so it is
// paid only when there is nothing recorded for their version, or when what is
// recorded is old enough to be suspect.
func (p *Proxy) shouldRecord(protocolVersion int32) bool {
	if p.opts.Snapshots == nil || !limbo.Supports(protocolVersion) {
		return false
	}
	snap, ok := p.opts.Snapshots.Get(protocolVersion)
	if !ok {
		return true
	}
	if snap.Synthesized {
		// What is held was fetched by the proxy, which means its Login (play)
		// packet was composed from a version layout rather than taken from a
		// server. A real join carries the genuine article, and is worth the
		// larger registry set it costs this player to take it.
		return true
	}
	return time.Since(snap.RecordedAt) > snapshotFreshness
}

// relayBackendLogin pumps the backend's login packets through to the client
// until login completes, answering anything addressed to the proxy itself.
func (p *Proxy) relayBackendLogin(
	backend, client *protocol.Conn,
	mode forward.Mode,
	entry control.ServerEntry,
	identity forward.Identity,
) error {
	for {
		pkt, err := backend.ReadPacket()
		if err != nil {
			return fmt.Errorf("read from backend during login: %w", err)
		}

		switch pkt.ID {
		case idSetCompression:
			r := protocol.NewReader(pkt.Data)
			threshold, err := r.VarInt()
			if err != nil {
				return fmt.Errorf("backend set compression: %w", err)
			}
			// Order matters twice over: the packet itself travels uncompressed
			// on both links, so it must be written before either side switches.
			if err := client.WritePacket(pkt); err != nil {
				return fmt.Errorf("relay set compression: %w", err)
			}
			backend.EnableCompression(int(threshold))
			client.EnableCompression(int(threshold))

		case idEncryptionRequest:
			// A backend that asks the proxy to authenticate is in online mode,
			// which cannot work behind a proxy: the player's session is already
			// spent on the proxy itself. Tell the player something they can
			// repeat to an operator rather than dropping them silently.
			if err := disconnectLogin(client, msgBackendOnlineMode); err != nil {
				p.log.Debug("could not explain the online-mode backend", "error", err)
			}
			return fmt.Errorf("backend %q is in online mode: %s", entry.Tag, onlineModeFix(mode))

		case idLoginPluginRequest:
			if err := p.answerLoginPlugin(backend, pkt, mode, entry, identity); err != nil {
				return err
			}

		case idLoginSuccess:
			if err := client.WritePacket(pkt); err != nil {
				return fmt.Errorf("relay login success: %w", err)
			}
			return nil

		case idLoginDisconnect:
			// The backend refused the player. Passing its reason through is far
			// more useful than substituting one of the proxy's own.
			if err := client.WritePacket(pkt); err != nil {
				return fmt.Errorf("relay backend disconnect: %w", err)
			}
			return fmt.Errorf("backend %q rejected the login", entry.Tag)

		default:
			return fmt.Errorf("unexpected packet 0x%02x from backend during login", pkt.ID)
		}
	}
}

// onlineModeFix names what an operator has to change on a backend that is still
// in online mode, in the terms of the forwarding mode it is configured for.
func onlineModeFix(mode forward.Mode) string {
	const base = "set online-mode=false in its server.properties"
	switch mode {
	case forward.ModeBungeeCord:
		return base + " and turn on BungeeCord compatibility (settings.bungeecord in spigot.yml)"
	case forward.ModeVelocity:
		return base + " and enable Velocity modern forwarding with the same secret"
	default:
		// Nothing else to configure: the proxy has already authenticated the
		// player and replays their verified name.
		return base + " (nothing else to configure for forwarding \"none\")"
	}
}

// answerLoginPlugin replies to a backend's login plugin request. The only one
// the proxy understands is Velocity's identity query; anything else is declined
// explicitly, which is what the protocol expects for an unknown channel.
func (p *Proxy) answerLoginPlugin(
	backend *protocol.Conn,
	pkt *protocol.Packet,
	mode forward.Mode,
	entry control.ServerEntry,
	identity forward.Identity,
) error {
	r := protocol.NewReader(pkt.Data)
	messageID, err := r.VarInt()
	if err != nil {
		return fmt.Errorf("login plugin request id: %w", err)
	}
	channel, err := r.String(32767)
	if err != nil {
		return fmt.Errorf("login plugin request channel: %w", err)
	}

	if mode != forward.ModeVelocity || channel != forward.VelocityChannel {
		decline := protocol.NewWriter(idLoginPluginResponse).
			VarInt(messageID).
			Bool(false).
			Packet()
		return backend.WritePacket(decline)
	}

	body, err := forward.VelocityResponse(
		[]byte(entry.ForwardingSecret),
		forward.RequestedVelocityVersion(r.Remaining()),
		identity,
	)
	if err != nil {
		return fmt.Errorf("server %q: %w", entry.Tag, err)
	}

	reply := protocol.NewWriter(idLoginPluginResponse).
		VarInt(messageID).
		Bool(true).
		Raw(body).
		Packet()
	return backend.WritePacket(reply)
}

// tunnel joins the two connections and blocks until either end closes.
//
// Both links share a compression threshold by now, so the framed bytes are
// identical on each side and only the client's stream cipher has to be applied.
// That makes this a straight copy rather than a packet-by-packet re-encode.
func (p *Proxy) tunnel(client, backend *protocol.Conn) {
	// A held player may have sat here for a long time; clear any deadline left
	// over from the login exchange so an idle session is not torn down.
	_ = client.SetReadDeadline(time.Time{})
	_ = client.SetWriteDeadline(time.Time{})

	var once sync.Once
	closeBoth := func() {
		once.Do(func() {
			_ = client.Close()
			_ = backend.Close()
		})
	}

	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		defer closeBoth()
		_, _ = io.Copy(backend.StreamWriter(), client.StreamReader())
	}()
	go func() {
		defer wg.Done()
		defer closeBoth()
		_, _ = io.Copy(client.StreamWriter(), backend.StreamReader())
	}()
	wg.Wait()
}
