// Package route is the proxy's session state machine: it accepts a connection,
// works out who is on the other end and where they should go, and then either
// joins them to a backend or holds them until one exists.
package route

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net"
	"sync/atomic"
	"time"

	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/auth"
	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/control"
	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/mcver"
	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/protocol"
	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/status"
)

// Options configures a Proxy.
type Options struct {
	// ListenAddr is the single address every player connects to.
	ListenAddr string
	// Control talks to the bot. Every decision that needs database or Discord
	// state goes through it.
	Control *control.Client
	// Poller supplies the current backend list and online state.
	Poller *control.Poller
	Logger *slog.Logger
	// Verifier checks players against the Mojang session server. Leave it nil
	// outside tests; the zero value builds the real one.
	Verifier *auth.Verifier
}

// Proxy accepts Minecraft connections on one port and routes them.
type Proxy struct {
	opts     Options
	log      *slog.Logger
	keys     *auth.KeyPair
	verifier *auth.Verifier
	sessions atomic.Int64
}

// New builds a Proxy, generating the keypair it will authenticate players with.
func New(opts Options) (*Proxy, error) {
	if opts.Control == nil || opts.Poller == nil {
		return nil, errors.New("route: a control client and poller are required")
	}
	if opts.Logger == nil {
		opts.Logger = slog.Default()
	}
	keys, err := auth.GenerateKeyPair()
	if err != nil {
		return nil, err
	}
	verifier := opts.Verifier
	if verifier == nil {
		verifier = auth.NewVerifier(nil)
	}
	return &Proxy{
		opts:     opts,
		log:      opts.Logger,
		keys:     keys,
		verifier: verifier,
	}, nil
}

// ListenAndServe accepts connections until ctx is cancelled.
func (p *Proxy) ListenAndServe(ctx context.Context) error {
	var lc net.ListenConfig
	listener, err := lc.Listen(ctx, "tcp", p.opts.ListenAddr)
	if err != nil {
		return err
	}
	p.log.Info("proxy listening", "addr", p.opts.ListenAddr)

	// Unblock Accept on shutdown.
	go func() {
		<-ctx.Done()
		_ = listener.Close()
	}()

	for {
		conn, err := listener.Accept()
		if err != nil {
			if ctx.Err() != nil {
				return nil
			}
			// A single failed accept is usually a transient file-descriptor
			// shortage, not a reason to take the whole listener down.
			p.log.Warn("accept failed", "error", err)
			continue
		}
		go p.handleConn(ctx, conn)
	}
}

// handleConn owns one client connection from accept to close.
func (p *Proxy) handleConn(ctx context.Context, raw net.Conn) {
	defer func() {
		if r := recover(); r != nil {
			// One malformed connection must never take the proxy down with it.
			p.log.Error("panic handling connection", "remote", raw.RemoteAddr().String(), "panic", r)
			_ = raw.Close()
		}
	}()
	defer raw.Close()

	if tcp, ok := raw.(*net.TCPConn); ok {
		_ = tcp.SetNoDelay(true)
	}
	_ = raw.SetDeadline(time.Now().Add(handshakeDeadline))

	// A pre-1.7 ping is not a framed packet, so it has to be recognised from
	// the first byte before the framer ever sees the stream.
	first := make([]byte, 1)
	if _, err := io.ReadFull(raw, first); err != nil {
		return
	}
	if first[0] == status.LegacyPingFirstByte {
		if err := status.ServeLegacy(raw, p.statusInfo(mcver.V1_8)); err != nil {
			p.log.Debug("legacy ping failed", "error", err)
		}
		return
	}

	conn := protocol.NewConn(&prefixConn{Conn: raw, prefix: first})

	hs, err := readHandshake(conn)
	if err != nil {
		p.log.Debug("handshake failed", "remote", raw.RemoteAddr().String(), "error", err)
		return
	}

	if hs.NextState == stateStatus {
		if err := status.Serve(conn, p.statusInfo(hs.Protocol)); err != nil {
			p.log.Debug("status failed", "error", err)
		}
		return
	}

	if err := p.handleLogin(ctx, conn, raw, hs); err != nil {
		p.log.Info("login ended", "remote", raw.RemoteAddr().String(), "error", err)
	}
}

// statusInfo renders the current server-list entry.
func (p *Proxy) statusInfo(clientProtocol int32) status.Info {
	cfg := p.opts.Poller.Snapshot()
	info := status.Info{
		MOTD:           defaultMOTD,
		MaxPlayers:     100,
		OnlinePlayers:  int(p.sessions.Load()),
		VersionName:    "Proxy",
		ClientProtocol: clientProtocol,
	}
	if cfg == nil {
		// The bot has not answered yet. Say so rather than implying the servers
		// are down, because those are very different problems for an operator.
		info.MOTD = "§eStarting up§r\n§7Waiting for the manager"
		return info
	}
	if cfg.MOTD != "" {
		info.MOTD = cfg.MOTD
	}
	if cfg.MaxPlayers > 0 {
		info.MaxPlayers = cfg.MaxPlayers
	}
	return info
}

const defaultMOTD = "§bServer Hub§r\n§7Join to start a server"

// entryFor looks up a backend's connection details.
func (p *Proxy) entryFor(id int) (control.ServerEntry, bool) {
	return p.opts.Poller.Server(id)
}
