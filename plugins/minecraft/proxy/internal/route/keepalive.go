package route

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/protocol"
)

// The login phase has no keep-alive packet, but it does have login plugin
// messages, and the vanilla client answers every one of them — always with
// "I did not understand", which is exactly as useful here, because the point is
// only that a packet crosses the wire in each direction.
const (
	// holdChannel is a channel name no real plugin will claim.
	holdChannel = "mcproxy:hold"
	// holdPingInterval must stay comfortably inside the roughly thirty seconds
	// a vanilla client waits before deciding the server has gone away.
	holdPingInterval = 10 * time.Second
	// holdReplyTimeout bounds how long to wait for the client's answer. A
	// client that does not answer at all is about to time itself out anyway.
	holdReplyTimeout = 20 * time.Second
)

// errClientSilent means the client stopped answering keep-alives.
var errClientSilent = errors.New("client stopped answering during hold")

// keepAliveUntil holds the connection open until done is closed or the client
// goes away.
//
// The exchange is strict lock-step: one request is sent, its answer is read,
// and only then does the loop wait. That matters more than it looks. At every
// moment the loop is idle, the client has nothing in flight, so when the hold
// ends the connection can be handed straight to the backend tunnel with no risk
// of a stray packet being forwarded into the middle of the backend's own login.
func (p *Proxy) keepAliveUntil(ctx context.Context, conn *protocol.Conn, done <-chan struct{}) error {
	var messageID int32

	for {
		// Check first, so a server that is already up costs no round trip.
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-done:
			return nil
		default:
		}

		messageID++
		req := protocol.NewWriter(idLoginPluginRequest).
			VarInt(messageID).
			String(holdChannel).
			Packet()
		if err := conn.WritePacket(req); err != nil {
			return fmt.Errorf("hold keep-alive write: %w", err)
		}

		if err := conn.SetReadDeadline(time.Now().Add(holdReplyTimeout)); err != nil {
			return err
		}
		pkt, err := conn.ReadPacket()
		if err != nil {
			return fmt.Errorf("%w: %v", errClientSilent, err)
		}
		if err := conn.SetReadDeadline(time.Time{}); err != nil {
			return err
		}

		switch pkt.ID {
		case idLoginPluginResponse:
			// The contents are of no interest; that it arrived is the point.
		case idLoginAcknowledged:
			// Only sent after a Login Success the proxy never sent, so this is
			// a client that is not following the protocol.
			return fmt.Errorf("client acknowledged a login that was never completed")
		default:
			return fmt.Errorf("unexpected packet 0x%02x from client during hold", pkt.ID)
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-done:
			return nil
		case <-time.After(holdPingInterval):
		}
	}
}
