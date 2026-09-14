package limbo

import (
	"fmt"

	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/protocol"
)

// Login-phase packet ids. Unlike the play phase these have not moved since the
// modern login was introduced, so they need no per-version table.
const (
	idLoginSuccess      = 0x02
	idLoginAcknowledged = 0x03
)

// completeLogin finishes the login the proxy started, on its own authority.
//
// This is the point of no return. Everywhere else the proxy relays a backend's
// Login Success, so the player ends up logged in to that backend; here there is
// no backend, and the proxy says "you are in" itself. The profile it sends is
// the one Mojang verified, skin properties included, so the player waits as
// themselves rather than as a default-skinned stranger.
func (s *Session) completeLogin(opts Options) error {
	w := protocol.NewWriter(idLoginSuccess).
		UUID(opts.UUID).
		String(opts.Name).
		VarInt(int32(len(opts.Skin)))
	for _, prop := range opts.Skin {
		w.String(prop.Name).String(prop.Value)
		if prop.Signature != "" {
			w.Bool(true).String(prop.Signature)
		} else {
			w.Bool(false)
		}
	}
	if s.profile.strictErrorHandling {
		// This flag reads as though leniency were the kind option, and it is
		// not. With it unset, a client that hits an error handling a packet
		// logs it and carries on in a phase it can never leave, until its own
		// read timeout eventually reports the wrong problem — "Timed out" for
		// what was really a malformed registry set. Set, the same failure ends
		// immediately with an error naming what broke. The vanilla server sends
		// it set for that reason, and a failure we can diagnose is worth much
		// more here than one that merely takes longer to arrive.
		w.Bool(true)
	}
	if s.profile.sessionID {
		// A session id the proxy has no use for, but the field is not optional.
		// The zero UUID is what an absent session looks like.
		w.UUID(protocol.UUID{})
	}
	if err := s.write(w.Packet()); err != nil {
		return fmt.Errorf("login success: %w", err)
	}

	return s.awaitLoginAcknowledged()
}

// awaitLoginAcknowledged waits for the client to acknowledge the login,
// stepping over anything that arrives in front of it.
//
// Something usually does. The proxy asks the client for a stored server choice
// earlier in the login and gives up on the answer after a few seconds, but
// giving up does not recall the question: a client on a slow link answers after
// the proxy has stopped listening, and that answer is still on the wire here.
// Insisting on the acknowledgement being first would turn a slow connection
// into a player dropped with no message, which is the one outcome the waiting
// world exists to prevent.
//
// The patience is bounded so that a client sending an endless stream of
// something else cannot hold the connection open for ever.
func (s *Session) awaitLoginAcknowledged() error {
	const maxUnexpected = 8

	for i := 0; i <= maxUnexpected; i++ {
		pkt, err := s.conn.ReadPacket()
		if err != nil {
			return fmt.Errorf("waiting for login acknowledged: %w", err)
		}
		if pkt.ID == idLoginAcknowledged {
			return nil
		}
		s.log.Debug("stepping over a packet sent before the login acknowledgement",
			"packet", pkt.ID)
	}
	return fmt.Errorf("client never acknowledged the login")
}
