// Package limbo puts a player into an empty world that the proxy itself
// serves, so that it has somewhere to talk to them.
//
// # Why there is a world at all
//
// A player whose server is down has to wait somewhere. Stalling the login works
// and needs no world, but it is mute: nothing can be shown to a client that has
// not finished logging in, so the proxy cannot say what it is waiting for, and
// the player cannot answer. Putting them into a world instead costs a great
// deal more protocol, and buys the only thing that matters — a conversation.
//
// # What the world is
//
// Nothing. There is no terrain, no chunk is ever sent, and the player is left
// floating with movement they make going nowhere. That is deliberate: every
// additional thing a world contains is version-specific data that would have to
// be kept correct for client versions that do not exist yet. An empty room
// needs only the registries the client insists on before it will enter the play
// phase at all.
//
// # What it costs
//
// The registry set the client demands changes with every release, so this
// package can only serve versions it has been taught. [Supports] reports which,
// and a caller must have a fallback for the rest — in this proxy, the mute
// login-phase hold.
package limbo

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/protocol"
)

// Property is one signed profile property, as Mojang returned it. They are
// replayed verbatim in Login Success so the player sees their own skin while
// they wait rather than a default one.
type Property struct {
	Name      string
	Value     string
	Signature string
}

// Options configures a waiting-world session.
type Options struct {
	// Protocol is the client's protocol version. [Supports] must be true for
	// it, or [Enter] fails without having written anything.
	Protocol int32
	// Name and UUID are the player's verified identity.
	Name string
	UUID protocol.UUID
	// Skin carries the signed profile properties, which may be empty.
	Skin []Property
	// Snapshot is the recorded configuration phase to replay. Without one there
	// is no world to put anybody in; see [Snapshot] for why the proxy does not
	// simply build its own.
	Snapshot *Snapshot
	Logger   *slog.Logger
}

// ErrUnsupported means this package has no registry data for the client's
// version, so it cannot build a world the client would accept. The caller is
// expected to fall back to something that needs no world.
var ErrUnsupported = errors.New("limbo: no waiting world for this client version")

// Session is a player standing in the waiting world.
//
// One goroutine inside the session reads from the client; everything else is
// driven by the caller, which may call [Session.Say], [Session.StoreCookie] and
// [Session.Transfer] from its own goroutine.
type Session struct {
	conn    *protocol.Conn
	profile profile
	log     *slog.Logger

	// commands carries what the player typed, without the leading slash.
	commands chan string

	// closeOnce keeps Close idempotent: it is called by the caller when it is
	// done, by the read loop when the player goes, and by the keep-alive loop
	// when they stop answering.
	closeOnce sync.Once
	closeErr  error

	// waitingSince is when the oldest unanswered keep-alive went out, and is
	// zero when the client is up to date.
	keepAliveMu  sync.Mutex
	waitingSince time.Time
}

// Supports reports whether a client of this protocol version can be given a
// waiting world.
func Supports(protocolVersion int32) bool {
	_, ok := profileFor(protocolVersion)
	return ok
}

// Enter takes a client that has just been authenticated and puts it into the
// waiting world: it completes the login, negotiates the configuration phase,
// and sends the play-phase packets that leave the player standing in an empty
// room.
//
// The connection is owned by the returned Session from here on. On any error
// the caller should close the connection: the client has been written to, so
// there is no state left to fall back to.
func Enter(ctx context.Context, conn *protocol.Conn, opts Options) (*Session, error) {
	prof, ok := profileFor(opts.Protocol)
	if !ok {
		return nil, fmt.Errorf("%w: protocol %d", ErrUnsupported, opts.Protocol)
	}
	if opts.Snapshot == nil {
		return nil, fmt.Errorf("%w: nothing recorded for protocol %d", ErrUnsupported, opts.Protocol)
	}
	if len(opts.Snapshot.Config) == 0 {
		return nil, fmt.Errorf("%w: the recording for protocol %d describes no world",
			ErrUnsupported, opts.Protocol)
	}
	if opts.Snapshot.Protocol != opts.Protocol {
		// Replaying one version's registry set to another version's client is
		// the one mistake this whole design exists to prevent, so it is checked
		// rather than trusted.
		return nil, fmt.Errorf("limbo: snapshot is for protocol %d, client is %d",
			opts.Snapshot.Protocol, opts.Protocol)
	}
	log := opts.Logger
	if log == nil {
		log = slog.Default()
	}

	s := &Session{
		conn:     conn,
		profile:  prof,
		log:      log,
		commands: make(chan string, 4),
	}

	if err := s.completeLogin(opts); err != nil {
		return nil, fmt.Errorf("limbo: completing login: %w", err)
	}
	if err := s.configure(opts.Snapshot); err != nil {
		return nil, fmt.Errorf("limbo: configuration phase: %w", err)
	}
	if err := s.spawn(opts.Snapshot); err != nil {
		return nil, fmt.Errorf("limbo: entering play: %w", err)
	}

	go s.readLoop(ctx)
	go s.keepAliveLoop(ctx)
	return s, nil
}

// Commands yields the commands the player types, without the leading slash.
// The channel is closed when the player goes away.
func (s *Session) Commands() <-chan string { return s.commands }
