package limbo

import (
	"errors"
	"fmt"

	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/protocol"
)

// Building a Login (play) packet, for a world the proxy fetched rather than
// recorded.
//
// This is the one packet in the waiting world that is composed from a
// per-version layout rather than copied from a real server, and it is here
// under protest. The layout has changed three times across the versions served,
// and a wrong field disconnects the player — which is exactly the class of risk
// the recording design exists to avoid.
//
// It cannot be avoided, because the packet and the act of joining are the same
// moment: a backend sends Login (play) at the instant it puts the player in the
// world, so the only way to be given one is to actually join, which means a
// visible player appearing on every server. Composing it is the lesser evil.
//
// The hedge is that a composed packet is provisional. A snapshot built this way
// is marked [Snapshot.Synthesized], and the first real player to join at that
// version replaces it with the server's own.

// Dimension is where a fetched world puts the player: an index into the
// dimension type registry that travels beside it, and the name of that entry.
type Dimension struct {
	// Index is the position of the entry in the registry as it was sent. The
	// wire field is an index, not a name, so the two have to agree.
	Index int32
	Name  string
}

// ErrNoDimension means a registry set carried no dimension type, so there is
// nowhere to put a player.
var ErrNoDimension = errors.New("limbo: the registry set names no dimension type")

// dimensionTypeRegistry is the registry whose first entry the waiting world
// borrows. Any entry will do — the player is below the bottom of the world
// whatever its shape — so the first is taken rather than one being chosen.
const dimensionTypeRegistry = "minecraft:dimension_type"

// idRegistryData is the configuration packet carrying one registry.
const idRegistryData = 0x07

// DimensionFrom finds a dimension to put a player in, given the registry set
// that will be replayed alongside it.
func DimensionFrom(config []protocol.Packet) (Dimension, error) {
	for i := range config {
		if config[i].ID != idRegistryData {
			continue
		}
		r := protocol.NewReader(config[i].Data)
		registry, err := r.String(32767)
		if err != nil || registry != dimensionTypeRegistry {
			continue
		}
		count, err := r.VarInt()
		if err != nil || count <= 0 {
			return Dimension{}, ErrNoDimension
		}
		// Only the first entry's name is needed, and it sits immediately after
		// the count — so none of the optional NBT that follows each entry has
		// to be walked, or even understood.
		name, err := r.String(32767)
		if err != nil {
			return Dimension{}, fmt.Errorf("limbo: unreadable dimension type: %w", err)
		}
		return Dimension{Index: 0, Name: name}, nil
	}
	return Dimension{}, ErrNoDimension
}

// Values that describe the waiting world in Login (play). None of them is
// observable to a player who is floating below an empty world, but all of them
// have to be inside the range the client will accept.
const (
	// synthEntityID is the player's own entity id. Nothing else exists to
	// collide with it.
	synthEntityID = 1
	// synthViewDistance is the minimum a client accepts. No chunk is ever sent,
	// so asking for more would only make it look for more.
	synthViewDistance = 2
	// synthGameMode is adventure: the player cannot break anything, which
	// matters only in that it is the least surprising mode for a room with
	// nothing in it.
	synthGameMode = 2
	// synthPreviousGameMode is the documented "there was no previous mode".
	synthPreviousGameMode = -1
	// synthSeaLevel is vanilla's, for the versions that carry the field. It
	// affects nothing without terrain.
	synthSeaLevel = 63
)

// BuildLoginPlay composes the packet that moves a client into the play phase.
//
// Everything in it is fixed except the dimension, which has to agree with the
// registry set replayed just before it. Secure chat is declared unenforced,
// because the waiting world never relays a signed message from anybody.
func BuildLoginPlay(protocolVersion int32, dim Dimension) (*protocol.Packet, error) {
	prof, ok := profileFor(protocolVersion)
	if !ok {
		return nil, fmt.Errorf("%w: protocol %d", ErrUnsupported, protocolVersion)
	}
	if dim.Name == "" {
		return nil, ErrNoDimension
	}

	w := protocol.NewWriter(prof.loginPlay).
		Int(synthEntityID).
		Bool(false). // hardcore
		// The worlds this client may be told about: only the one it is entering.
		VarInt(1).
		String(dim.Name).
		VarInt(1). // max players, unused by the client since 1.16
		VarInt(synthViewDistance).
		VarInt(synthViewDistance). // simulation distance
		Bool(false).               // reduced debug info
		Bool(true).                // enable respawn screen
		Bool(false).               // do limited crafting
		VarInt(dim.Index).
		String(dim.Name).
		Long(0). // hashed seed, which only varies biome noise
		UByte(synthGameMode).
		Byte(synthPreviousGameMode).
		Bool(false). // is debug
		Bool(false). // is flat
		Bool(false). // has death location, so none follows
		VarInt(0)    // portal cooldown

	if prof.seaLevel {
		w.VarInt(synthSeaLevel)
	}
	if prof.onlineMode {
		// The proxy is the online-mode authority, whatever the backend is.
		w.Bool(true)
	}
	w.Bool(false) // enforces secure chat

	return w.Packet(), nil
}
