// Package status answers the server-list ping.
//
// The proxy always answers from its own state and never forwards the ping to a
// backend. That is deliberate: the whole point of the proxy is that the list
// entry stays alive and informative while every backend is down, which is
// exactly when a forwarded ping would fail.
package status

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"

	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/protocol"
)

// Info is the snapshot rendered into a ping response.
type Info struct {
	// MOTD may contain legacy § codes and at most one newline.
	MOTD string
	// MaxPlayers is cosmetic; the proxy enforces no limit of its own.
	MaxPlayers int
	// OnlinePlayers counts the sessions currently held by the proxy.
	OnlinePlayers int
	// VersionName is shown by the client only when the protocol mismatches.
	VersionName string
	// ClientProtocol is echoed back so that the client never renders the entry
	// as incompatible. The proxy really does accept every version it can log
	// in, so claiming the client's own protocol is honest rather than a trick.
	ClientProtocol int32
}

type versionJSON struct {
	Name     string `json:"name"`
	Protocol int32  `json:"protocol"`
}

type playersJSON struct {
	Max    int   `json:"max"`
	Online int   `json:"online"`
	Sample []any `json:"sample"`
}

type responseJSON struct {
	Version            versionJSON     `json:"version"`
	Players            playersJSON     `json:"players"`
	Description        json.RawMessage `json:"description"`
	EnforcesSecureChat bool            `json:"enforcesSecureChat"`
}

// Payload renders the status response JSON.
func Payload(info Info) ([]byte, error) {
	name := info.VersionName
	if name == "" {
		name = "Proxy"
	}
	return json.Marshal(responseJSON{
		Version: versionJSON{Name: name, Protocol: info.ClientProtocol},
		Players: playersJSON{
			Max:    info.MaxPlayers,
			Online: info.OnlinePlayers,
			Sample: []any{},
		},
		Description:        LegacyToComponentJSON(info.MOTD),
		EnforcesSecureChat: false,
	})
}

// Packet ids in the status state, identical across every protocol version.
const (
	idStatusRequest  = 0x00
	idStatusResponse = 0x00
	idPingRequest    = 0x01
	idPongResponse   = 0x01
)

// Serve runs the status exchange to completion on an already-handshaked
// connection. Clients send a status request then a ping, but some send only the
// ping, and some disconnect after the response without pinging at all, so a
// clean end of stream is a success and not an error.
func Serve(conn *protocol.Conn, info Info) error {
	for {
		pkt, err := conn.ReadPacket()
		if err != nil {
			if errors.Is(err, io.EOF) {
				return nil
			}
			return err
		}
		switch pkt.ID {
		case idStatusRequest:
			payload, err := Payload(info)
			if err != nil {
				return fmt.Errorf("render status: %w", err)
			}
			out := protocol.NewWriter(idStatusResponse).String(string(payload)).Packet()
			if err := conn.WritePacket(out); err != nil {
				return err
			}
		case idPingRequest:
			// Echo the client's nonce back untouched; it is timing the round
			// trip and any other value shows up as a broken latency reading.
			r := protocol.NewReader(pkt.Data)
			nonce, err := r.Long()
			if err != nil {
				// A ping without a payload is malformed, but answering with
				// zero is friendlier than dropping the connection.
				nonce = 0
			}
			out := protocol.NewWriter(idPongResponse).Long(nonce).Packet()
			if err := conn.WritePacket(out); err != nil {
				return err
			}
			return nil
		default:
			return fmt.Errorf("unexpected packet 0x%02x in status state", pkt.ID)
		}
	}
}
