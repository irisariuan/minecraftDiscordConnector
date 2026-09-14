package route

import (
	"strconv"
	"strings"
	"time"

	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/mcver"
	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/protocol"
)

// The cookie the waiting world leaves behind when it transfers a player.
//
// A transfer is a fresh connection: the client reconnects from scratch, with a
// new handshake and a new login, and nothing of the old session survives except
// what was deliberately stored. The choice the player just made is exactly that
// — without it they would arrive back at the waiting world and be asked the
// same question they had only now answered.
//
// The payload is not signed, and does not need to be. The only thing a player
// can do by editing it is name a different server, which they could have done
// by typing its name; the decision that actually matters, whether they may use
// that server at all, is taken from the bot's answer for this login and never
// from the cookie. The timestamp is there for staleness, not for security.
const (
	// choiceCookie is the namespaced key the cookie is stored under. The
	// namespace keeps it clear of anything a backend plugin might store.
	choiceCookie = "mcproxy:target"
	// choiceTTL is how long a stored choice is worth acting on. A transfer
	// takes seconds; anything older is a player reconnecting later, who should
	// be asked afresh rather than sent wherever they went last time.
	choiceTTL = 2 * time.Minute
)

// encodeChoice renders a chosen server id for storage on the client.
func encodeChoice(server int, now time.Time) []byte {
	return []byte(strconv.Itoa(server) + ":" + strconv.FormatInt(now.Unix(), 10))
}

// decodeChoice reads a stored choice back, reporting whether it is still worth
// acting on. Anything malformed is treated as absent: a cookie is attacker
// controlled, and the worst outcome of ignoring one is an extra visit to the
// waiting world.
func decodeChoice(payload []byte, now time.Time) (int, bool) {
	id, ts, ok := strings.Cut(string(payload), ":")
	if !ok {
		return 0, false
	}
	server, err := strconv.Atoi(id)
	if err != nil || server <= 0 {
		return 0, false
	}
	sec, err := strconv.ParseInt(ts, 10, 64)
	if err != nil {
		return 0, false
	}
	age := now.Sub(time.Unix(sec, 0))
	if age < -choiceTTL || age > choiceTTL {
		// A clock that disagrees in either direction is a clock we cannot use
		// to judge freshness, so the choice is discarded rather than trusted.
		return 0, false
	}
	return server, true
}

// Login-phase cookie packet ids. Unlike the play phase these are the same in
// every version that has cookies at all.
const (
	idCookieRequest  = 0x05 // clientbound
	idCookieResponse = 0x04 // serverbound
)

// choiceReplyTimeout bounds the wait for a cookie the client may not have. A
// client that has never been to the waiting world still answers — with "no" —
// so this only ever elapses for something that is not a vanilla client, and
// what it costs such a client is one pause before being shown the same choices
// it would have been shown anyway.
const choiceReplyTimeout = 3 * time.Second

// readChoice asks the client whether it is carrying a choice made in the
// waiting world a moment ago.
//
// This is the other half of the transfer. The waiting world hands the player
// back to this same proxy, and the only thing that distinguishes that arrival
// from any other is the cookie — without it they would be asked to choose all
// over again, having just chosen.
//
// Every failure here returns "no choice", which is the same answer as a client
// that has never seen the waiting world. Nothing about this is worth failing a
// login over: the worst outcome is that the player is asked to choose again.
func (p *Proxy) readChoice(conn *protocol.Conn, protocolVersion int32) int {
	if !mcver.SupportsTransfer(protocolVersion) {
		return 0
	}

	req := protocol.NewWriter(idCookieRequest).String(choiceCookie).Packet()
	if err := conn.WritePacket(req); err != nil {
		return 0
	}

	if err := conn.SetReadDeadline(time.Now().Add(choiceReplyTimeout)); err != nil {
		return 0
	}
	defer func() { _ = conn.SetReadDeadline(time.Time{}) }()

	pkt, err := conn.ReadPacket()
	if err != nil || pkt.ID != idCookieResponse {
		return 0
	}

	r := protocol.NewReader(pkt.Data)
	if _, err := r.String(32767); err != nil { // the key, echoed back
		return 0
	}
	has, err := r.Bool()
	if err != nil || !has {
		return 0
	}
	payload, err := r.ByteArray()
	if err != nil {
		return 0
	}

	server, ok := decodeChoice(payload, time.Now())
	if !ok {
		return 0
	}
	return server
}
