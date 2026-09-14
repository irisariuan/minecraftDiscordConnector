package status

import (
	"bytes"
	"encoding/binary"
	"io"
	"net"
	"strconv"
	"strings"
	"testing"
	"time"
	"unicode/utf16"
)

// legacy16Ping is what a 1.6 client sends: the 0xFE marker, the 0x01 payload
// byte and a plugin message carrying the host it dialled. The proxy drains it
// without parsing, so its exact contents do not matter, only that it arrives.
var legacy16Ping = []byte{0x01, 0xFA, 0x00, 0x0B}

// readLegacyResponse reads one legacy response frame and returns its decoded,
// null-separated fields. It insists the frame is exactly as long as its own
// length prefix claims, so a miscounted UTF-16 length fails here.
func readLegacyResponse(t *testing.T, conn net.Conn) []string {
	t.Helper()

	// net.Pipe delivers one Write to one Read, so a single read that is short
	// of the declared length, or longer than it, is a malformed frame.
	buf := make([]byte, 1<<17)
	n, err := conn.Read(buf)
	if err != nil {
		t.Fatalf("read legacy response: %v", err)
	}
	frame := buf[:n]

	if len(frame) < 3 {
		t.Fatalf("legacy response is %d bytes, too short to carry a header: %x", len(frame), frame)
	}
	if frame[0] != 0xFF {
		t.Fatalf("legacy response starts with 0x%02x, want 0xFF (the legacy disconnect packet)", frame[0])
	}

	units := int(binary.BigEndian.Uint16(frame[1:3]))
	if want := 3 + units*2; len(frame) != want {
		t.Fatalf("legacy response is %d bytes; its length prefix of %d UTF-16 units implies %d",
			len(frame), units, want)
	}

	encoded := make([]uint16, units)
	for i := range encoded {
		encoded[i] = binary.BigEndian.Uint16(frame[3+i*2:])
	}
	return strings.Split(string(utf16.Decode(encoded)), "\x00")
}

// serveLegacy runs ServeLegacy against an in-memory pipe, sends clientSends
// from the client end, and returns the decoded response fields.
func serveLegacy(t *testing.T, info Info, clientSends []byte) []string {
	t.Helper()

	serverSide, clientSide := net.Pipe()
	deadline := time.Now().Add(pipeTimeout)
	_ = serverSide.SetDeadline(deadline)
	_ = clientSide.SetDeadline(deadline)
	t.Cleanup(func() {
		_ = serverSide.Close()
		_ = clientSide.Close()
	})

	done := make(chan error, 1)
	go func() { done <- ServeLegacy(serverSide, info) }()

	if _, err := clientSide.Write(clientSends); err != nil {
		t.Fatalf("send legacy ping: %v", err)
	}
	fields := readLegacyResponse(t, clientSide)

	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("ServeLegacy returned %v, want nil", err)
		}
	case <-time.After(pipeTimeout):
		t.Fatal("ServeLegacy never returned after writing its response")
	}
	return fields
}

func assertFields(t *testing.T, got, want []string) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("legacy response has %d fields %q, want %d fields %q", len(got), got, len(want), want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("legacy field %d = %q, want %q", i, got[i], want[i])
		}
	}
}

func TestServeLegacyFrame(t *testing.T) {
	t.Parallel()

	info := Info{
		MOTD:           "Server Hub",
		MaxPlayers:     100,
		OnlinePlayers:  3,
		VersionName:    "Proxy",
		ClientProtocol: 47,
	}

	got := serveLegacy(t, info, legacy16Ping)
	assertFields(t, got, []string{"§1", "47", "Proxy", "Server Hub", "3", "100"})
}

func TestServeLegacyFieldContents(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		info Info
		want []string
	}{
		{
			name: "section codes in the MOTD are stripped so the frame stays parseable",
			info: Info{
				MOTD:           "§bServer Hub§r §7idle",
				MaxPlayers:     20,
				OnlinePlayers:  0,
				VersionName:    "Proxy",
				ClientProtocol: 47,
			},
			// The leading §1 marker survives; only the MOTD's own codes go.
			want: []string{"§1", "47", "Proxy", "Server Hub idle", "0", "20"},
		},
		{
			name: "a newline in the MOTD becomes a space rather than breaking the frame",
			info: Info{
				MOTD:           "Server Hub\nJoin to start a server",
				MaxPlayers:     20,
				OnlinePlayers:  1,
				VersionName:    "Proxy",
				ClientProtocol: 47,
			},
			want: []string{"§1", "47", "Proxy", "Server Hub Join to start a server", "1", "20"},
		},
		{
			name: "a null byte in the MOTD cannot forge an extra field",
			info: Info{
				MOTD:           "Server Hub\x00999\x009999",
				MaxPlayers:     20,
				OnlinePlayers:  1,
				VersionName:    "Proxy",
				ClientProtocol: 47,
			},
			want: []string{"§1", "47", "Proxy", "Server Hub 999 9999", "1", "20"},
		},
		{
			name: "an empty version name falls back to the default",
			info: Info{
				MOTD:           "Server Hub",
				MaxPlayers:     20,
				OnlinePlayers:  1,
				VersionName:    "",
				ClientProtocol: 47,
			},
			want: []string{"§1", "47", "Proxy", "Server Hub", "1", "20"},
		},
		{
			name: "the client's own protocol is echoed back",
			info: Info{
				MOTD:           "Server Hub",
				MaxPlayers:     20,
				OnlinePlayers:  1,
				VersionName:    "Proxy",
				ClientProtocol: 78,
			},
			want: []string{"§1", "78", "Proxy", "Server Hub", "1", "20"},
		},
		{
			name: "multibyte text is carried as UTF-16",
			info: Info{
				MOTD:           "§b日本語のサーバー",
				MaxPlayers:     20,
				OnlinePlayers:  1,
				VersionName:    "Proxy",
				ClientProtocol: 47,
			},
			want: []string{"§1", "47", "Proxy", "日本語のサーバー", "1", "20"},
		},
		{
			name: "a MOTD outside the basic plane is encoded as a surrogate pair",
			info: Info{
				MOTD:           "Hub 🧱",
				MaxPlayers:     20,
				OnlinePlayers:  1,
				VersionName:    "Proxy",
				ClientProtocol: 47,
			},
			want: []string{"§1", "47", "Proxy", "Hub 🧱", "1", "20"},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			assertFields(t, serveLegacy(t, tc.info, legacy16Ping), tc.want)
		})
	}
}

func TestServeLegacyPlayerCountsAreDecimal(t *testing.T) {
	t.Parallel()

	info := Info{
		MOTD:           "Server Hub",
		MaxPlayers:     1234,
		OnlinePlayers:  56,
		VersionName:    "Proxy",
		ClientProtocol: 47,
	}
	got := serveLegacy(t, info, legacy16Ping)
	if got[4] != strconv.Itoa(info.OnlinePlayers) {
		t.Errorf("online players field = %q, want %q", got[4], strconv.Itoa(info.OnlinePlayers))
	}
	if got[5] != strconv.Itoa(info.MaxPlayers) {
		t.Errorf("max players field = %q, want %q", got[5], strconv.Itoa(info.MaxPlayers))
	}
}

// TestServeLegacyAnswersABare0xFEPing pins the promise ServeLegacy's own doc
// comment makes: the request is drained "without blocking on a client that sent
// only the single 0xFE byte".
//
// A Minecraft 1.4 or 1.5 client's whole server-list ping is that one byte. The
// caller in route.handleConn has already consumed it before ServeLegacy is
// reached, so there is nothing left to drain and the unconditional
// conn.Read blocks until the connection's 20 second handshake deadline fires —
// by which time the write deadline has expired too, so the client is answered
// with nothing at all.
func TestServeLegacyAnswersABare0xFEPing(t *testing.T) {
	t.Skip("BUG: ServeLegacy blocks in its drain Read when the client sent only the 0xFE byte; see the comment above and the report")

	t.Parallel()

	serverSide, clientSide := net.Pipe()
	t.Cleanup(func() {
		_ = serverSide.Close()
		_ = clientSide.Close()
	})

	// Drain whatever the proxy writes, so that only the drain Read can block.
	got := make(chan []byte, 1)
	go func() {
		buf := make([]byte, 1<<17)
		n, _ := clientSide.Read(buf)
		got <- bytes.Clone(buf[:n])
	}()

	done := make(chan error, 1)
	go func() {
		done <- ServeLegacy(serverSide, Info{
			MOTD:           "Server Hub",
			MaxPlayers:     20,
			OnlinePlayers:  0,
			VersionName:    "Proxy",
			ClientProtocol: 47,
		})
	}()

	select {
	case err := <-done:
		if err != nil && err != io.EOF {
			t.Fatalf("ServeLegacy returned %v, want nil", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("ServeLegacy blocked on a client that sent only the 0xFE byte, so a 1.4/1.5 client is never answered")
	}

	select {
	case frame := <-got:
		if len(frame) == 0 || frame[0] != 0xFF {
			t.Fatalf("legacy response = %x, want a frame starting with 0xFF", frame)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("no legacy response was written")
	}
}
