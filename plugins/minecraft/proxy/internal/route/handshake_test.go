package route

import (
	"bytes"
	"io"
	"net"
	"strings"
	"testing"
	"time"

	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/protocol"
)

// unitPipeTimeout bounds every connection-driven test in the unit files. These
// exchanges are a handful of bytes over an in-memory pipe, so reaching this
// means something deadlocked and the test must fail rather than hang.
const unitPipeTimeout = 10 * time.Second

// unitPipe returns a protocol.Conn on each end of an in-memory pipe, with
// deadlines set so that a test can never block forever.
func unitPipe(t *testing.T) (server, client *protocol.Conn) {
	t.Helper()

	serverSide, clientSide := net.Pipe()
	deadline := time.Now().Add(unitPipeTimeout)
	_ = serverSide.SetDeadline(deadline)
	_ = clientSide.SetDeadline(deadline)
	t.Cleanup(func() {
		_ = serverSide.Close()
		_ = clientSide.Close()
	})
	return protocol.NewConn(serverSide), protocol.NewConn(clientSide)
}

// sendPacket writes pkt from another goroutine, because net.Pipe blocks a write
// until the far end reads it. The returned func reports the write's result and
// must be called after the read it feeds.
func sendPacket(t *testing.T, conn *protocol.Conn, pkt *protocol.Packet) func() {
	t.Helper()

	done := make(chan error, 1)
	go func() { done <- conn.WritePacket(pkt) }()
	return func() {
		t.Helper()
		select {
		case err := <-done:
			if err != nil {
				t.Fatalf("write packet 0x%02x: %v", pkt.ID, err)
			}
		case <-time.After(unitPipeTimeout):
			t.Fatal("the packet write never completed")
		}
	}
}

// handshakePacket builds a handshake in the one layout every protocol version
// has ever used.
func handshakePacket(proto int32, host string, port uint16, next int32) *protocol.Packet {
	return protocol.NewWriter(0x00).
		VarInt(proto).
		String(host).
		UShort(port).
		VarInt(next).
		Packet()
}

func TestReadHandshake(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		proto     int32
		host      string
		port      uint16
		nextState int32
	}{
		{
			name:      "next state 1 asks for the server list ping",
			proto:     767,
			host:      "mc.example.com",
			port:      25565,
			nextState: stateStatus,
		},
		{
			name:      "next state 2 asks to log in",
			proto:     767,
			host:      "survival.example.com",
			port:      25565,
			nextState: stateLogin,
		},
		{
			name:      "next state 3 is a transfer, which logs in the same way",
			proto:     767,
			host:      "mc.example.com",
			port:      25565,
			nextState: stateTransfer,
		},
		{
			name:      "an old protocol is accepted here and rejected later",
			proto:     4,
			host:      "mc.example.com",
			port:      25565,
			nextState: stateLogin,
		},
		{
			name:      "a host with a Forge marker is returned verbatim for cleanHost to deal with",
			proto:     767,
			host:      "mc.example.com\x00FML\x00",
			port:      25565,
			nextState: stateLogin,
		},
		{
			name:      "a non-default port is carried through",
			proto:     767,
			host:      "mc.example.com",
			port:      25577,
			nextState: stateLogin,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			server, client := unitPipe(t)
			wait := sendPacket(t, client, handshakePacket(tc.proto, tc.host, tc.port, tc.nextState))

			hs, err := readHandshake(server)
			if err != nil {
				t.Fatalf("readHandshake: %v", err)
			}
			wait()

			if hs.Protocol != tc.proto {
				t.Errorf("handshake protocol = %d, want %d", hs.Protocol, tc.proto)
			}
			if hs.Host != tc.host {
				t.Errorf("handshake host = %q, want %q", hs.Host, tc.host)
			}
			if hs.Port != tc.port {
				t.Errorf("handshake port = %d, want %d", hs.Port, tc.port)
			}
			if hs.NextState != tc.nextState {
				t.Errorf("handshake next state = %d, want %d", hs.NextState, tc.nextState)
			}
		})
	}
}

func TestReadHandshakeRejects(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name            string
		packet          *protocol.Packet
		wantErrContains string
	}{
		{
			name:            "next state 0 is not a state",
			packet:          handshakePacket(767, "mc.example.com", 25565, 0),
			wantErrContains: "invalid next state",
		},
		{
			name:            "next state 4 is not a state",
			packet:          handshakePacket(767, "mc.example.com", 25565, 4),
			wantErrContains: "invalid next state",
		},
		{
			name:            "a negative next state is not a state",
			packet:          handshakePacket(767, "mc.example.com", 25565, -1),
			wantErrContains: "invalid next state",
		},
		{
			name: "a packet id other than 0x00 is not a handshake",
			packet: protocol.NewWriter(0x01).
				VarInt(767).String("mc.example.com").UShort(25565).VarInt(stateLogin).Packet(),
			wantErrContains: "0x01",
		},
		{
			name:            "a truncated handshake is rejected rather than half-read",
			packet:          protocol.NewWriter(0x00).VarInt(767).String("mc.example.com").Packet(),
			wantErrContains: "handshake port",
		},
		{
			name:            "an empty handshake body is rejected",
			packet:          protocol.NewWriter(0x00).Packet(),
			wantErrContains: "handshake protocol version",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			server, client := unitPipe(t)
			wait := sendPacket(t, client, tc.packet)

			hs, err := readHandshake(server)
			wait()
			if err == nil {
				t.Fatalf("readHandshake accepted %+v, want an error", hs)
			}
			if hs != nil {
				t.Errorf("readHandshake returned %+v alongside its error, want nil", hs)
			}
			if !strings.Contains(err.Error(), tc.wantErrContains) {
				t.Errorf("error %q does not mention %q", err, tc.wantErrContains)
			}
		})
	}
}

func TestPrefixConn(t *testing.T) {
	t.Parallel()

	t.Run("the prefix is served before anything from the socket", func(t *testing.T) {
		t.Parallel()

		serverSide, clientSide := net.Pipe()
		deadline := time.Now().Add(unitPipeTimeout)
		_ = serverSide.SetDeadline(deadline)
		_ = clientSide.SetDeadline(deadline)
		t.Cleanup(func() {
			_ = serverSide.Close()
			_ = clientSide.Close()
		})

		pc := &prefixConn{Conn: serverSide, prefix: []byte{0xAA, 0xBB}}
		done := make(chan error, 1)
		go func() {
			_, err := clientSide.Write([]byte{0xCC, 0xDD})
			done <- err
		}()

		// A read with plenty of room still gets only the prefix: the prefix and
		// the socket must never be merged into one read.
		buf := make([]byte, 8)
		n, err := pc.Read(buf)
		if err != nil {
			t.Fatalf("read prefix: %v", err)
		}
		if want := []byte{0xAA, 0xBB}; !bytes.Equal(buf[:n], want) {
			t.Fatalf("first read = %x, want the prefix %x", buf[:n], want)
		}

		rest := make([]byte, 2)
		if _, err := io.ReadFull(pc, rest); err != nil {
			t.Fatalf("read from the socket: %v", err)
		}
		if want := []byte{0xCC, 0xDD}; !bytes.Equal(rest, want) {
			t.Errorf("second read = %x, want the socket bytes %x", rest, want)
		}
		if err := <-done; err != nil {
			t.Fatalf("write: %v", err)
		}
	})

	t.Run("a buffer smaller than the prefix gets it a piece at a time", func(t *testing.T) {
		t.Parallel()

		serverSide, clientSide := net.Pipe()
		deadline := time.Now().Add(unitPipeTimeout)
		_ = serverSide.SetDeadline(deadline)
		_ = clientSide.SetDeadline(deadline)
		t.Cleanup(func() {
			_ = serverSide.Close()
			_ = clientSide.Close()
		})

		pc := &prefixConn{Conn: serverSide, prefix: []byte{0xAA, 0xBB, 0xCC}}
		done := make(chan error, 1)
		go func() {
			_, err := clientSide.Write([]byte{0xDD})
			done <- err
		}()

		want := []byte{0xAA, 0xBB, 0xCC, 0xDD}
		one := make([]byte, 1)
		for i, wantByte := range want {
			n, err := pc.Read(one)
			if err != nil {
				t.Fatalf("read %d: %v", i, err)
			}
			if n != 1 {
				t.Fatalf("read %d returned %d bytes, want 1", i, n)
			}
			if one[0] != wantByte {
				t.Fatalf("byte %d = 0x%02x, want 0x%02x", i, one[0], wantByte)
			}
		}
		if err := <-done; err != nil {
			t.Fatalf("write: %v", err)
		}
	})

	t.Run("an empty prefix reads straight from the socket", func(t *testing.T) {
		t.Parallel()

		serverSide, clientSide := net.Pipe()
		deadline := time.Now().Add(unitPipeTimeout)
		_ = serverSide.SetDeadline(deadline)
		_ = clientSide.SetDeadline(deadline)
		t.Cleanup(func() {
			_ = serverSide.Close()
			_ = clientSide.Close()
		})

		pc := &prefixConn{Conn: serverSide}
		done := make(chan error, 1)
		go func() {
			_, err := clientSide.Write([]byte{0x01, 0x02})
			done <- err
		}()

		got := make([]byte, 2)
		if _, err := io.ReadFull(pc, got); err != nil {
			t.Fatalf("read: %v", err)
		}
		if want := []byte{0x01, 0x02}; !bytes.Equal(got, want) {
			t.Errorf("read = %x, want %x", got, want)
		}
		if err := <-done; err != nil {
			t.Fatalf("write: %v", err)
		}
	})

	t.Run("the framer sees a whole handshake whose first byte was already taken", func(t *testing.T) {
		t.Parallel()

		// This is exactly what handleConn does: one byte is read to check for a
		// legacy ping, and when it is not one, that byte still belongs to the
		// handshake frame.
		serverSide, clientSide := net.Pipe()
		deadline := time.Now().Add(unitPipeTimeout)
		_ = serverSide.SetDeadline(deadline)
		_ = clientSide.SetDeadline(deadline)
		t.Cleanup(func() {
			_ = serverSide.Close()
			_ = clientSide.Close()
		})

		client := protocol.NewConn(clientSide)
		done := make(chan error, 1)
		go func() {
			done <- client.WritePacket(handshakePacket(767, "survival.example.com", 25565, stateLogin))
		}()

		first := make([]byte, 1)
		if _, err := io.ReadFull(serverSide, first); err != nil {
			t.Fatalf("read the first byte: %v", err)
		}
		if first[0] == 0xFE {
			t.Fatalf("the handshake's first byte is 0x%02x, which collides with the legacy ping marker", first[0])
		}

		conn := protocol.NewConn(&prefixConn{Conn: serverSide, prefix: first})
		hs, err := readHandshake(conn)
		if err != nil {
			t.Fatalf("readHandshake after re-serving the first byte: %v", err)
		}
		if err := <-done; err != nil {
			t.Fatalf("write handshake: %v", err)
		}

		if hs.Protocol != 767 || hs.Host != "survival.example.com" || hs.NextState != stateLogin {
			t.Errorf("handshake = %+v, want protocol 767, host survival.example.com, next state %d",
				hs, stateLogin)
		}
	})
}
