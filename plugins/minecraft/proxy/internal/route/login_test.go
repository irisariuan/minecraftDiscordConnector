package route

import (
	"strings"
	"testing"

	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/forward"
	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/protocol"
)

// loginStartUUID is the profile id the proxy relays to a backend.
const loginStartUUID = "069a79f4-44e9-4726-a5be-fca90e38aaf5"

func mustParseUUID(t *testing.T, s string) protocol.UUID {
	t.Helper()
	u, err := protocol.ParseUUID(s)
	if err != nil {
		t.Fatalf("ParseUUID(%q): %v", s, err)
	}
	return u
}

// loginStartEra is one protocol-version window with its own Login Start layout.
//
// build writes the packet exactly as a client of that version would, and
// checkWritten walks the packet writeLoginStart produces and asserts it is the
// layout a backend of that version expects. Between them the two document every
// layout this packet has had.
type loginStartEra struct {
	name  string
	proto int32
	build func(name string, id protocol.UUID) *protocol.Packet
	// checkWritten is nil where writeLoginStart is not exercised for this case.
	checkWritten func(t *testing.T, r *protocol.Reader, name string, id protocol.UUID)
}

// nameOnly is the layout every version before 1.19 used.
func nameOnly(name string, _ protocol.UUID) *protocol.Packet {
	return protocol.NewWriter(idLoginStart).String(name).Packet()
}

func checkNameOnly(t *testing.T, r *protocol.Reader, name string, _ protocol.UUID) {
	t.Helper()
	readString(t, r, "name", name)
}

// readString reads one string field and checks it.
func readString(t *testing.T, r *protocol.Reader, what, want string) {
	t.Helper()
	got, err := r.String(0)
	if err != nil {
		t.Fatalf("read %s: %v", what, err)
	}
	if got != want {
		t.Errorf("%s = %q, want %q", what, got, want)
	}
}

// readBool reads one boolean field and checks it.
func readBool(t *testing.T, r *protocol.Reader, what string, want bool) {
	t.Helper()
	got, err := r.Bool()
	if err != nil {
		t.Fatalf("read %s: %v", what, err)
	}
	if got != want {
		t.Errorf("%s = %t, want %t", what, got, want)
	}
}

// readUUID reads one uuid field and checks it.
func readUUID(t *testing.T, r *protocol.Reader, what string, want protocol.UUID) {
	t.Helper()
	got, err := r.UUID()
	if err != nil {
		t.Fatalf("read %s: %v", what, err)
	}
	if got != want {
		t.Errorf("%s = %s, want %s", what, got, want)
	}
}

func loginStartEras() []loginStartEra {
	return []loginStartEra{
		{
			name:         "1.8 (47): the name and nothing else",
			proto:        47,
			build:        nameOnly,
			checkWritten: checkNameOnly,
		},
		{
			name:         "1.16.5 (754): still the name and nothing else",
			proto:        754,
			build:        nameOnly,
			checkWritten: checkNameOnly,
		},
		{
			name:  "1.19 (759) with no chat-signing key",
			proto: 759,
			build: func(name string, _ protocol.UUID) *protocol.Packet {
				return protocol.NewWriter(idLoginStart).String(name).Bool(false).Packet()
			},
			checkWritten: func(t *testing.T, r *protocol.Reader, name string, _ protocol.UUID) {
				t.Helper()
				readString(t, r, "name", name)
				readBool(t, r, "has signature block", false)
			},
		},
		{
			name:  "1.19 (759) carrying a chat-signing key",
			proto: 759,
			build: func(name string, _ protocol.UUID) *protocol.Packet {
				return protocol.NewWriter(idLoginStart).
					String(name).
					Bool(true).
					Long(1893456000000).
					ByteArray([]byte{0x30, 0x82, 0x01, 0x22}).
					ByteArray([]byte{0xde, 0xad, 0xbe, 0xef}).
					Packet()
			},
		},
		{
			name:  "1.19.1 (760) with no chat-signing key and an optional uuid",
			proto: 760,
			build: func(name string, id protocol.UUID) *protocol.Packet {
				return protocol.NewWriter(idLoginStart).
					String(name).
					Bool(false).
					Bool(true).
					UUID(id).
					Packet()
			},
			checkWritten: func(t *testing.T, r *protocol.Reader, name string, id protocol.UUID) {
				t.Helper()
				readString(t, r, "name", name)
				readBool(t, r, "has signature block", false)
				readBool(t, r, "has uuid", true)
				readUUID(t, r, "uuid", id)
			},
		},
		{
			name:  "1.19.2 (760) carrying a chat-signing key and an optional uuid",
			proto: 760,
			build: func(name string, id protocol.UUID) *protocol.Packet {
				return protocol.NewWriter(idLoginStart).
					String(name).
					Bool(true).
					Long(1893456000000).
					ByteArray([]byte{0x30, 0x82, 0x01, 0x22}).
					ByteArray([]byte{0xde, 0xad, 0xbe, 0xef}).
					Bool(true).
					UUID(id).
					Packet()
			},
		},
		{
			name:  "1.19.2 (760) with an absent optional uuid",
			proto: 760,
			build: func(name string, _ protocol.UUID) *protocol.Packet {
				return protocol.NewWriter(idLoginStart).
					String(name).
					Bool(false).
					Bool(false).
					Packet()
			},
		},
		{
			name:  "1.19.3 (761): the signature block is gone, the optional uuid remains",
			proto: 761,
			build: func(name string, id protocol.UUID) *protocol.Packet {
				return protocol.NewWriter(idLoginStart).String(name).Bool(true).UUID(id).Packet()
			},
			checkWritten: func(t *testing.T, r *protocol.Reader, name string, id protocol.UUID) {
				t.Helper()
				readString(t, r, "name", name)
				readBool(t, r, "has uuid", true)
				readUUID(t, r, "uuid", id)
			},
		},
		{
			name:  "1.20.1 (763): unchanged since 1.19.3",
			proto: 763,
			build: func(name string, id protocol.UUID) *protocol.Packet {
				return protocol.NewWriter(idLoginStart).String(name).Bool(true).UUID(id).Packet()
			},
			checkWritten: func(t *testing.T, r *protocol.Reader, name string, id protocol.UUID) {
				t.Helper()
				readString(t, r, "name", name)
				readBool(t, r, "has uuid", true)
				readUUID(t, r, "uuid", id)
			},
		},
		{
			name:  "1.20.2 (764): the uuid is unconditional",
			proto: 764,
			build: func(name string, id protocol.UUID) *protocol.Packet {
				return protocol.NewWriter(idLoginStart).String(name).UUID(id).Packet()
			},
			checkWritten: func(t *testing.T, r *protocol.Reader, name string, id protocol.UUID) {
				t.Helper()
				readString(t, r, "name", name)
				readUUID(t, r, "uuid", id)
			},
		},
		{
			name:  "1.21 (767): unchanged since 1.20.2",
			proto: 767,
			build: func(name string, id protocol.UUID) *protocol.Packet {
				return protocol.NewWriter(idLoginStart).String(name).UUID(id).Packet()
			},
			checkWritten: func(t *testing.T, r *protocol.Reader, name string, id protocol.UUID) {
				t.Helper()
				readString(t, r, "name", name)
				readUUID(t, r, "uuid", id)
			},
		},
	}
}

func TestReadLoginStartAcrossProtocolEras(t *testing.T) {
	t.Parallel()

	const playerName = "Notch"
	id := mustParseUUID(t, loginStartUUID)

	for _, era := range loginStartEras() {
		t.Run(era.name, func(t *testing.T) {
			t.Parallel()

			server, client := unitPipe(t)
			wait := sendPacket(t, client, era.build(playerName, id))

			ls, err := readLoginStart(server, era.proto)
			if err != nil {
				t.Fatalf("readLoginStart(proto=%d): %v", era.proto, err)
			}
			wait()

			if ls.Name != playerName {
				t.Errorf("login start name = %q, want %q", ls.Name, playerName)
			}
		})
	}
}

func TestReadLoginStartRejects(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name            string
		proto           int32
		packet          *protocol.Packet
		wantErrContains string
	}{
		{
			name:            "a packet id other than 0x00 is not login start",
			proto:           767,
			packet:          protocol.NewWriter(0x01).String("Notch").UUID(protocol.UUID{}).Packet(),
			wantErrContains: "0x01",
		},
		{
			name:            "an empty name is refused rather than passed to Mojang",
			proto:           47,
			packet:          protocol.NewWriter(idLoginStart).String("").Packet(),
			wantErrContains: "empty name",
		},
		{
			name:            "an empty body has no name to read",
			proto:           47,
			packet:          protocol.NewWriter(idLoginStart).Packet(),
			wantErrContains: "login start name",
		},
		{
			name:            "a 1.19 packet missing its signature flag is refused rather than misparsed",
			proto:           759,
			packet:          protocol.NewWriter(idLoginStart).String("Notch").Packet(),
			wantErrContains: "signature flag",
		},
		{
			name:  "a 1.19 packet with a truncated signature block is refused",
			proto: 759,
			packet: protocol.NewWriter(idLoginStart).
				String("Notch").Bool(true).Long(1).Packet(),
			wantErrContains: "public key",
		},
		{
			name:            "a name longer than 16 characters is refused",
			proto:           47,
			packet:          protocol.NewWriter(idLoginStart).String(strings.Repeat("a", 17)).Packet(),
			wantErrContains: "login start name",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			server, client := unitPipe(t)
			wait := sendPacket(t, client, tc.packet)

			ls, err := readLoginStart(server, tc.proto)
			wait()
			if err == nil {
				t.Fatalf("readLoginStart accepted %+v, want an error", ls)
			}
			if ls != nil {
				t.Errorf("readLoginStart returned %+v alongside its error, want nil", ls)
			}
			if !strings.Contains(err.Error(), tc.wantErrContains) {
				t.Errorf("error %q does not mention %q", err, tc.wantErrContains)
			}
		})
	}
}

func TestWriteLoginStartRoundTrips(t *testing.T) {
	t.Parallel()

	const playerName = "Notch"
	id := mustParseUUID(t, loginStartUUID)

	for _, era := range loginStartEras() {
		if era.checkWritten == nil {
			// This era's case exists to exercise a layout a client may send but
			// the proxy never writes, such as a relayed chat-signing key.
			continue
		}
		t.Run(era.name, func(t *testing.T) {
			t.Parallel()

			backend, proxy := unitPipe(t)

			done := make(chan error, 1)
			go func() { done <- writeLoginStart(proxy, era.proto, playerName, id) }()

			// The backend reads what the proxy wrote, first as the raw layout
			// its version expects, then through the proxy's own parser.
			pkt, err := backend.ReadPacket()
			if err != nil {
				t.Fatalf("read the written login start: %v", err)
			}
			if err := <-done; err != nil {
				t.Fatalf("writeLoginStart(proto=%d): %v", era.proto, err)
			}
			if pkt.ID != idLoginStart {
				t.Fatalf("written packet id = 0x%02x, want 0x%02x", pkt.ID, idLoginStart)
			}

			r := protocol.NewReader(pkt.Data)
			era.checkWritten(t, r, playerName, id)
			if r.Len() != 0 {
				t.Errorf("written login start has %d trailing bytes: %x", r.Len(), r.Remaining())
			}

			// And the same bytes must parse back through readLoginStart, which
			// is what the proxy would do at the other end of this link.
			server, client := unitPipe(t)
			wait := sendPacket(t, client, pkt)
			ls, err := readLoginStart(server, era.proto)
			if err != nil {
				t.Fatalf("readLoginStart(proto=%d) on what writeLoginStart produced: %v", era.proto, err)
			}
			wait()
			if ls.Name != playerName {
				t.Errorf("round-tripped name = %q, want %q", ls.Name, playerName)
			}
		})
	}
}

func TestWriteLoginStartCarriesTheVerifiedName(t *testing.T) {
	t.Parallel()

	// The proxy sends the name Mojang returned, not the one the client claimed,
	// so a name that differs in case from the claim must survive intact.
	const verified = "Notch"
	id := mustParseUUID(t, loginStartUUID)

	backend, proxy := unitPipe(t)
	done := make(chan error, 1)
	go func() { done <- writeLoginStart(proxy, 767, verified, id) }()

	pkt, err := backend.ReadPacket()
	if err != nil {
		t.Fatalf("read login start: %v", err)
	}
	if err := <-done; err != nil {
		t.Fatalf("writeLoginStart: %v", err)
	}

	r := protocol.NewReader(pkt.Data)
	readString(t, r, "name", verified)
	readUUID(t, r, "uuid", id)
}

// The advice in an online-mode rejection has to name something the operator can
// actually change, and must not tell them to "enable none forwarding".
func TestOnlineModeFixNamesTheRightChange(t *testing.T) {
	for _, tc := range []struct {
		mode     forward.Mode
		contains string
		absent   string
	}{
		{forward.ModeNone, `nothing else to configure`, "bungeecord"},
		{forward.ModeBungeeCord, "spigot.yml", "velocity"},
		{forward.ModeVelocity, "secret", "spigot.yml"},
	} {
		got := onlineModeFix(tc.mode)
		if !strings.Contains(got, "online-mode=false") {
			t.Errorf("%s: %q does not name online-mode=false", tc.mode, got)
		}
		if !strings.Contains(strings.ToLower(got), tc.contains) {
			t.Errorf("%s: %q does not mention %q", tc.mode, got, tc.contains)
		}
		if strings.Contains(strings.ToLower(got), tc.absent) {
			t.Errorf("%s: %q should not mention %q", tc.mode, got, tc.absent)
		}
	}
}
