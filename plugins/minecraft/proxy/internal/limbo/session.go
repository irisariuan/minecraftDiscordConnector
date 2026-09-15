package limbo

import (
	"context"
	"errors"
	"fmt"
	"io"
	"math/rand/v2"
	"time"

	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/protocol"
	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/text"
)

const (
	// keepAliveInterval is how often the play phase is given something to
	// answer. The vanilla server uses fifteen seconds and disconnects at
	// thirty; ten leaves room for a slow round trip without ever approaching
	// the client's own patience.
	keepAliveInterval = 10 * time.Second
	// keepAliveGrace is how long an unanswered keep-alive may go before the
	// player is treated as gone. A client that has stopped answering is either
	// already disconnected or about to disconnect itself.
	keepAliveGrace = 30 * time.Second

	// writeTimeout bounds a single write to the client.
	//
	// The waiting world pushes a lot of unsolicited data — a replayed registry
	// set runs to hundreds of kilobytes — at a client that has done nothing to
	// ask for it. A client that opens a connection and then simply stops
	// reading, without closing, would otherwise wedge the goroutine writing to
	// it for ever, and with it the keep-alive loop that is supposed to notice.
	// A read deadline does not help: the write is where it stops.
	//
	// The deadline is set before each write and deliberately never cleared.
	// Several goroutines write here, and clearing it after one of them finished
	// would lift the deadline out from under another that was still going.
	writeTimeout = 30 * time.Second

	// voidY is where the player is put.
	//
	// It is not decoration. A client will not leave its loading screen until it
	// is either standing in a chunk or outside the world vertically, and the
	// waiting world sends no chunks at all, so being below the floor is the
	// whole mechanism by which the player ever sees anything. The lowest floor
	// a dimension may declare is -2032, so this clears any of them.
	voidY = -4096.0
)

// replyDeadline bounds how long the client may take to send something the entry
// sequence is waiting for. It is generous because one of those waits is for a
// client parsing a registry set that can run past a hundred kilobytes, and mean
// because a client that has stopped answering should not occupy a goroutine
// forever.
//
// Every read before the play phase is bounded by it. Afterwards liveness
// becomes the keep-alive loop's job, which is the only thing that can tell a
// player who is standing still from one who has gone.
//
// It is a variable rather than a constant so that the test covering the silent
// client does not have to wait out the real thing.
var replyDeadline = 30 * time.Second

// gameEventStartWaitingForChunks is the event that tells the client the server
// has begun sending the world. Nothing follows it here, which is precisely why
// the player has to be below the world for the loading screen to close.
const gameEventStartWaitingForChunks = 13

// playerAbilityInvulnerable and playerAbilityFlying are sent together, and
// without the "allow flying" bit on purpose: a client that is flying but not
// allowed to fly cannot stop, which is exactly the behaviour wanted for
// somebody parked over nothing. Invulnerability is what stops the void from
// killing them while they read.
const playerAbilityInvulnerable, playerAbilityFlying = 0x01, 0x02

// configure replays a recorded configuration phase and waits for the client to
// acknowledge the end of it.
//
// Nothing here is composed by the proxy: the packets are the ones a real
// backend sent to a real client of this same version, replayed in order. The
// one thing deliberately not replayed is the known-packs negotiation, because
// the recording forced the backend to spell out every registry entry in full,
// so there is nothing left for the client to supply from its own copy.
func (s *Session) configure(snap *Snapshot) error {
	for i := range snap.Config {
		if err := s.write(&snap.Config[i]); err != nil {
			return fmt.Errorf("replaying configuration packet %d of %d: %w", i+1, len(snap.Config), err)
		}
	}

	if err := s.write(protocol.NewWriter(cbFinishConfiguration).Packet()); err != nil {
		return fmt.Errorf("finish configuration: %w", err)
	}

	// The client answers with its own settings and its brand before it
	// acknowledges, and none of that is of interest — but it is in front of the
	// acknowledgement on the wire, so it has to be read past.
	return s.readUntil(sbAckFinishConfiguration, "the client to finish configuring")
}

// readUntil waits for one particular packet, stepping over whatever the client
// sends in front of it, and gives up after [replyDeadline].
//
// Something usually does arrive in front. The proxy asks the client for a
// stored server choice earlier in the login and stops listening after a few
// seconds, but giving up does not recall the question: a client on a slow link
// answers once the proxy has moved on, and that answer is still on the wire
// here. The same is true of the settings and brand a client sends before
// acknowledging the configuration phase. Insisting on the packet being first
// would turn a slow connection into a player dropped with no message, which is
// the one outcome the waiting world exists to prevent.
//
// The wait is bounded in time rather than by a count of packets, because the
// question being asked is whether this client is still participating, and time
// is the only unit that answers it for both a silent client and a chatty one.
func (s *Session) readUntil(id int32, what string) error {
	if err := s.conn.SetReadDeadline(time.Now().Add(replyDeadline)); err != nil {
		return err
	}
	defer func() { _ = s.conn.SetReadDeadline(time.Time{}) }()

	for {
		pkt, err := s.conn.ReadPacket()
		if err != nil {
			return fmt.Errorf("waiting for %s: %w", what, err)
		}
		if pkt.ID == id {
			return nil
		}
		s.log.Debug("stepping over a packet", "packet", pkt.ID, "waiting for", what)
	}
}

// spawn puts the player into the play phase and stops them falling.
func (s *Session) spawn(snap *Snapshot) error {
	// The backend's own Login (play), byte for byte. Its dimension field is an
	// index into the registry set replayed a moment ago, so the two agree by
	// construction — which is the entire reason this packet is copied rather
	// than built.
	if err := s.write(&snap.LoginPlay); err != nil {
		return fmt.Errorf("login (play): %w", err)
	}

	abilities := protocol.NewWriter(s.profile.playerAbilities).
		Byte(playerAbilityInvulnerable | playerAbilityFlying).
		Float(0.05).
		Float(0.1).
		Packet()
	if err := s.write(abilities); err != nil {
		return fmt.Errorf("player abilities: %w", err)
	}

	event := protocol.NewWriter(s.profile.gameEvent).
		UByte(gameEventStartWaitingForChunks).
		Float(0).
		Packet()
	if err := s.write(event); err != nil {
		return fmt.Errorf("game event: %w", err)
	}

	return s.write(s.positionPacket())
}

// positionPacket places the player, in whichever of the two layouts this
// version uses. Both are absolute: every relative-position flag is left clear,
// so the coordinates mean what they say.
func (s *Session) positionPacket() *protocol.Packet {
	const teleportID = 1

	if !s.profile.modernSyncPosition {
		return protocol.NewWriter(s.profile.syncPosition).
			Double(0).Double(voidY).Double(0).
			Float(0).Float(0).
			Byte(0).
			VarInt(teleportID).
			Packet()
	}

	// From 1.21.2 the teleport id leads, a velocity was added, and the flags
	// widened from a byte to an int.
	return protocol.NewWriter(s.profile.syncPosition).
		VarInt(teleportID).
		Double(0).Double(voidY).Double(0).
		Double(0).Double(0).Double(0).
		Float(0).Float(0).
		Int(0).
		Packet()
}

// Say sends one line of chat to the player.
//
// The line is written with § codes, as everything else in this proxy is, and
// converted into a real styled component on the way out. Whether a modern
// client still renders a § inside a component is undocumented, and the codes
// are marked deprecated, so none is ever put on the wire.
func (s *Session) Say(line string) error {
	content, err := text.NetworkNBT(line)
	if err != nil {
		return fmt.Errorf("encoding chat: %w", err)
	}
	return s.write(protocol.NewWriter(s.profile.systemChat).
		Raw(content).
		Bool(false). // chat, not the action bar
		Packet())
}

// StoreCookie asks the client to hold a small value for us.
//
// A cookie survives a transfer and nothing else — not a disconnect, not a
// restart — which is exactly the lifetime wanted for "the server this player
// just chose", and the reason the choice does not have to be remembered
// anywhere on this side.
func (s *Session) StoreCookie(key string, payload []byte) error {
	return s.write(protocol.NewWriter(s.profile.storeCookie).
		String(key).
		ByteArray(payload).
		Packet())
}

// Transfer sends the player to another address.
//
// The client closes this connection, opens one to the given address and logs in
// again from scratch, so this is a hand-off rather than a hand-over: there is
// no state to carry across and nothing to keep in step. What it is not is a
// disconnection — the player is never returned to the server list.
func (s *Session) Transfer(host string, port int) error {
	return s.write(protocol.NewWriter(s.profile.transfer).
		String(host).
		VarInt(int32(port)).
		Packet())
}

// write sends one packet under a deadline. See [writeTimeout].
func (s *Session) write(pkt *protocol.Packet) error {
	if err := s.conn.SetWriteDeadline(time.Now().Add(writeTimeout)); err != nil {
		return err
	}
	return s.conn.WritePacket(pkt)
}

// Close ends the session. Closing the connection is what stops the read loop,
// and through it closes the commands channel.
func (s *Session) Close() error {
	s.closeOnce.Do(func() { s.closeErr = s.conn.Close() })
	return s.closeErr
}

// readLoop turns what the player types into lines on the commands channel and
// keeps the keep-alive bookkeeping honest.
//
// Everything else the client sends — movement, held-item changes, the teleport
// confirmation, whatever a future version adds — is dropped without comment, and
// without the proxy needing to know its number.
// That is not laziness: a waiting world has no state for any of it to act on,
// and refusing to ignore an unrecognised packet would mean a new client version
// could not stand in a room it is otherwise perfectly able to stand in.
func (s *Session) readLoop(ctx context.Context) {
	defer close(s.commands)
	defer func() { _ = s.Close() }()

	for {
		if ctx.Err() != nil {
			return
		}
		pkt, err := s.conn.ReadPacket()
		if err != nil {
			if !errors.Is(err, io.EOF) && ctx.Err() == nil {
				s.log.Debug("waiting world read ended", "error", err)
			}
			return
		}

		switch pkt.ID {
		case s.profile.sbKeepAlive:
			s.answered()

		case s.profile.sbChatCommand, s.profile.sbChatCommandSigned:
			// Both layouts begin with the command text and differ only in what
			// follows it, which is signing material the waiting world has no
			// use for. Reading the first field is enough for either.
			s.deliver(pkt, 32767)

		case s.profile.sbChatMessage:
			// A player who types without a slash is trying to say the same
			// thing. Accepting it costs one case and saves somebody who cannot
			// work out why nothing is happening.
			s.deliver(pkt, 256)
		}
	}
}

// deliver extracts the leading string of a chat packet and offers it to the
// caller, dropping it if nobody is reading. Dropping is right: the alternative
// is blocking the read loop, which would stop the keep-alives being answered
// and eventually cost the player their connection over a line of text.
func (s *Session) deliver(pkt *protocol.Packet, max int) {
	line, err := protocol.NewReader(pkt.Data).String(max)
	if err != nil {
		s.log.Debug("unreadable chat from a waiting player", "error", err)
		return
	}
	select {
	case s.commands <- line:
	default:
		s.log.Debug("dropped a command from a waiting player", "line", line)
	}
}

// keepAliveLoop is what stops the client giving up on a world where nothing
// ever happens.
func (s *Session) keepAliveLoop(ctx context.Context) {
	ticker := time.NewTicker(keepAliveInterval)
	defer ticker.Stop()

	// The client starts counting the moment it enters the play phase, not from
	// the first keep-alive, and gives up after twenty seconds of silence. So
	// the first one goes out immediately rather than an interval from now.
	for first := true; ; first = false {
		if !first {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
		}

		if s.overdue() {
			s.log.Debug("waiting player stopped answering keep-alives")
			_ = s.Close()
			return
		}

		id := rand.Int64()
		s.expectAnswer()
		pkt := protocol.NewWriter(s.profile.keepAlive).Long(id).Packet()
		if err := s.write(pkt); err != nil {
			// The player has gone, or the connection has. Either way the read
			// loop is about to notice and close the channel.
			return
		}
	}
}

// The keep-alive bookkeeping tracks only how long the client has been silent,
// not which id is outstanding.
//
// Insisting that the id coming back is the id that went out would mean deciding
// what to do about a late answer, which is a perfectly healthy thing for a
// client on a slow connection to send. The question actually being asked is
// whether anybody is still there, and any answer at all settles it.
func (s *Session) expectAnswer() {
	s.keepAliveMu.Lock()
	defer s.keepAliveMu.Unlock()
	if s.waitingSince.IsZero() {
		s.waitingSince = time.Now()
	}
}

func (s *Session) answered() {
	s.keepAliveMu.Lock()
	defer s.keepAliveMu.Unlock()
	s.waitingSince = time.Time{}
}

func (s *Session) overdue() bool {
	s.keepAliveMu.Lock()
	defer s.keepAliveMu.Unlock()
	return !s.waitingSince.IsZero() && time.Since(s.waitingSince) > keepAliveGrace
}
