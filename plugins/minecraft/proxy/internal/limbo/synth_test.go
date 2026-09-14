package limbo

import (
	"errors"
	"testing"

	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/protocol"
)

// registryPacket builds a Registry Data packet the way a server does: the
// registry's name, then a count, then that many entries of an identifier and an
// optional blob of NBT.
func registryPacket(registry string, entries ...string) protocol.Packet {
	w := protocol.NewWriter(idRegistryData).String(registry).VarInt(int32(len(entries)))
	for _, name := range entries {
		// The NBT is present but not something this package ever reads, so a
		// single byte standing in for it is enough — and if anything here ever
		// started reading it, this test would be the first to say so.
		w.String(name).Bool(true).Raw([]byte{0x00})
	}
	return *w.Packet()
}

func TestDimensionFromTakesTheFirstDimensionType(t *testing.T) {
	t.Parallel()

	config := []protocol.Packet{
		registryPacket("minecraft:worldgen/biome", "minecraft:plains"),
		registryPacket("minecraft:dimension_type", "minecraft:overworld", "minecraft:the_nether"),
		registryPacket("minecraft:damage_type", "minecraft:in_fire"),
	}

	got, err := DimensionFrom(config)
	if err != nil {
		t.Fatalf("DimensionFrom: %v", err)
	}
	if got.Name != "minecraft:overworld" {
		t.Errorf("dimension name = %q, want the first entry", got.Name)
	}
	// The wire field is a position in the list, not a name, so the two have to
	// agree: naming the first entry means index zero and nothing else.
	if got.Index != 0 {
		t.Errorf("dimension index = %d, want 0 to match the first entry", got.Index)
	}
}

func TestDimensionFromReportsWhenThereIsNowhereToPutAnybody(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name   string
		config []protocol.Packet
	}{
		{"nothing at all", nil},
		{"no dimension registry", []protocol.Packet{registryPacket("minecraft:worldgen/biome", "minecraft:plains")}},
		{"an empty dimension registry", []protocol.Packet{registryPacket("minecraft:dimension_type")}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if _, err := DimensionFrom(tc.config); !errors.Is(err, ErrNoDimension) {
				t.Errorf("DimensionFrom = %v, want ErrNoDimension", err)
			}
		})
	}
}

// TestBuildLoginPlayLaysTheFieldsOutForEachVersion reads the composed packet
// back exactly as a client would.
//
// This is the one packet in the waiting world that is written from a documented
// layout rather than copied from a real server, so it is the one most worth
// decoding field by field: a field in the wrong place does not fail here, it
// disconnects somebody.
func TestBuildLoginPlayLaysTheFieldsOutForEachVersion(t *testing.T) {
	t.Parallel()

	dim := Dimension{Index: 0, Name: "minecraft:overworld"}

	for protocolVersion, prof := range profiles {
		t.Run(versionName(protocolVersion), func(t *testing.T) {
			t.Parallel()

			pkt, err := BuildLoginPlay(protocolVersion, dim)
			if err != nil {
				t.Fatalf("BuildLoginPlay: %v", err)
			}
			if pkt.ID != prof.loginPlay {
				t.Errorf("packet id = 0x%02x, want 0x%02x", pkt.ID, prof.loginPlay)
			}

			r := protocol.NewReader(pkt.Data)
			readInt(t, r, "entity id")
			readBool(t, r, "is hardcore")
			if got := readVarInt(t, r, "dimension count"); got != 1 {
				t.Errorf("dimension count = %d, want 1", got)
			}
			if got := readString(t, r, "dimension name in the list"); got != dim.Name {
				t.Errorf("dimension list names %q, want %q", got, dim.Name)
			}
			readVarInt(t, r, "max players")
			if got := readVarInt(t, r, "view distance"); got < 2 {
				t.Errorf("view distance = %d; the client refuses anything below 2", got)
			}
			readVarInt(t, r, "simulation distance")
			readBool(t, r, "reduced debug info")
			readBool(t, r, "enable respawn screen")
			readBool(t, r, "do limited crafting")

			if got := readVarInt(t, r, "dimension type"); got != dim.Index {
				t.Errorf("dimension type index = %d, want %d", got, dim.Index)
			}
			if got := readString(t, r, "dimension name"); got != dim.Name {
				t.Errorf("dimension name = %q, want %q", got, dim.Name)
			}
			readLong(t, r, "hashed seed")
			readUByte(t, r, "game mode")
			readByte(t, r, "previous game mode")
			readBool(t, r, "is debug")
			readBool(t, r, "is flat")
			if readBool(t, r, "has death location") {
				t.Fatal("a death location was declared, so the client will read two fields that were never written")
			}
			readVarInt(t, r, "portal cooldown")

			if prof.seaLevel {
				readVarInt(t, r, "sea level")
			}
			if prof.onlineMode {
				readBool(t, r, "online mode")
			}
			if readBool(t, r, "enforces secure chat") {
				t.Error("secure chat is enforced; the waiting world never relays a signed message")
			}

			// Anything left over means a field was written that the layout for
			// this version does not have, which desynchronises everything the
			// client reads afterwards.
			if n := r.Len(); n != 0 {
				t.Errorf("%d bytes left after the last field", n)
			}
		})
	}
}

func TestBuildLoginPlayRefusesWhatItCannotPlace(t *testing.T) {
	t.Parallel()

	if _, err := BuildLoginPlay(774, Dimension{Name: "minecraft:overworld"}); err == nil {
		t.Error("composed a packet for a version with no known numbering")
	}
	if _, err := BuildLoginPlay(767, Dimension{}); !errors.Is(err, ErrNoDimension) {
		t.Errorf("err = %v, want ErrNoDimension for a nameless dimension", err)
	}
}

func versionName(protocolVersion int32) string {
	return "protocol " + string(rune('0'+protocolVersion/100%10)) +
		string(rune('0'+protocolVersion/10%10)) + string(rune('0'+protocolVersion%10))
}

// Field readers that fail the test rather than returning an error, so the
// layout above reads as a layout.

func readVarInt(t *testing.T, r *protocol.Reader, what string) int32 {
	t.Helper()
	v, err := r.VarInt()
	if err != nil {
		t.Fatalf("reading %s: %v", what, err)
	}
	return v
}

func readString(t *testing.T, r *protocol.Reader, what string) string {
	t.Helper()
	v, err := r.String(32767)
	if err != nil {
		t.Fatalf("reading %s: %v", what, err)
	}
	return v
}

func readBool(t *testing.T, r *protocol.Reader, what string) bool {
	t.Helper()
	v, err := r.Bool()
	if err != nil {
		t.Fatalf("reading %s: %v", what, err)
	}
	return v
}

func readInt(t *testing.T, r *protocol.Reader, what string) int32 {
	t.Helper()
	v, err := r.Int()
	if err != nil {
		t.Fatalf("reading %s: %v", what, err)
	}
	return v
}

func readLong(t *testing.T, r *protocol.Reader, what string) int64 {
	t.Helper()
	v, err := r.Long()
	if err != nil {
		t.Fatalf("reading %s: %v", what, err)
	}
	return v
}

func readUByte(t *testing.T, r *protocol.Reader, what string) uint8 {
	t.Helper()
	v, err := r.UByte()
	if err != nil {
		t.Fatalf("reading %s: %v", what, err)
	}
	return v
}

func readByte(t *testing.T, r *protocol.Reader, what string) int8 {
	t.Helper()
	v, err := r.Byte()
	if err != nil {
		t.Fatalf("reading %s: %v", what, err)
	}
	return v
}
