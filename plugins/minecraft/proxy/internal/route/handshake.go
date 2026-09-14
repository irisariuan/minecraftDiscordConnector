package route

import (
	"fmt"
	"net"
	"strings"
	"time"

	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/protocol"
)

// prefixConn re-serves bytes that were read off a connection before it was
// handed to the packet framer. The legacy ping has to be detected by looking at
// the first byte, and that byte still belongs to the modern handshake when the
// ping turns out not to be legacy after all.
type prefixConn struct {
	net.Conn
	prefix []byte
}

func (c *prefixConn) Read(b []byte) (int, error) {
	if len(c.prefix) > 0 {
		n := copy(b, c.prefix)
		c.prefix = c.prefix[n:]
		return n, nil
	}
	return c.Conn.Read(b)
}

// nextState values carried by the handshake.
const (
	stateStatus   = 1
	stateLogin    = 2
	stateTransfer = 3
)

// handshake is the first packet of every connection.
type handshake struct {
	Protocol int32
	// Host is the address the client believes it is connecting to. It is
	// attacker-controlled and is only ever used as a display value or, after
	// validation, as the base of a forwarding payload.
	Host      string
	Port      uint16
	NextState int32
}

// readHandshake reads and validates the handshake packet.
func readHandshake(conn *protocol.Conn) (*handshake, error) {
	pkt, err := conn.ReadPacket()
	if err != nil {
		return nil, fmt.Errorf("read handshake: %w", err)
	}
	if pkt.ID != 0x00 {
		return nil, fmt.Errorf("expected handshake, got packet 0x%02x", pkt.ID)
	}

	r := protocol.NewReader(pkt.Data)
	proto, err := r.VarInt()
	if err != nil {
		return nil, fmt.Errorf("handshake protocol version: %w", err)
	}
	// 255 is the documented cap on this field. A longer one is either a broken
	// client or an attempt to make the proxy hold a large string.
	host, err := r.String(255)
	if err != nil {
		return nil, fmt.Errorf("handshake address: %w", err)
	}
	port, err := r.UShort()
	if err != nil {
		return nil, fmt.Errorf("handshake port: %w", err)
	}
	next, err := r.VarInt()
	if err != nil {
		return nil, fmt.Errorf("handshake next state: %w", err)
	}
	if next != stateStatus && next != stateLogin && next != stateTransfer {
		return nil, fmt.Errorf("invalid next state %d in handshake", next)
	}

	return &handshake{Protocol: proto, Host: host, Port: port, NextState: next}, nil
}

// cleanHost strips the decorations clients and proxies append to the handshake
// address: a Forge marker, and any forwarding payload a previous hop added.
// Both are separated from the hostname by a null byte, so everything from the
// first null onwards is discarded. What is left is the bare hostname, which is
// all the proxy ever passes on.
func cleanHost(host string) string {
	if i := strings.IndexByte(host, 0); i >= 0 {
		return host[:i]
	}
	return host
}

// clientIP returns the remote address without its port, which is the form both
// forwarding schemes and the session server expect.
func clientIP(conn net.Conn) string {
	host, _, err := net.SplitHostPort(conn.RemoteAddr().String())
	if err != nil {
		return conn.RemoteAddr().String()
	}
	return host
}

// handshakeDeadline bounds how long a connection may sit before it identifies
// itself. Held players get their deadlines cleared once they are past login;
// this only guards the opening exchange.
const handshakeDeadline = 20 * time.Second
