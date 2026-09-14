package limbo

import (
	"time"

	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/protocol"
)

// A Snapshot is everything a real backend told a real client, recorded so the
// proxy can say the same things later when no backend is running.
//
// # Why this is recorded rather than written
//
// Before a modern client will enter the play phase it demands a registry set:
// the dimension types, biomes, damage types, painting variants and a couple of
// dozen other tables that describe the world it is about to be shown. The list
// is long, it grows with every release, several entries must match vanilla
// names exactly, and a client that finds one missing or unbound does not
// degrade — it disconnects, at the moment the configuration phase ends.
//
// A proxy could carry its own copy of all that. Every limbo implementation does,
// and they all carry it per version, tens of kilobytes at a time, and they all
// break when a release adds a table they had not heard of. The proxy cannot even
// use the documented shortcut of naming entries without their contents, because
// that depends on telling the client which *game* version's data to load, and a
// handshake only carries a protocol number — one protocol number covers both
// 1.21.7 and 1.21.8, whose data differ.
//
// So the proxy does not author any of it. It listens. The first time a player
// joins a backend that is actually running, the proxy records what that backend
// sent them, and from then on it can furnish a waiting world for that client
// version out of data it knows to be right, because it came from the server
// those players are going to anyway.
//
// The cost of this is a cold start: a client version nobody has yet joined with
// has no snapshot, and those players get the silent hold instead. That is the
// right way round. A missing waiting world is an inconvenience; a wrong one is a
// disconnect.
type Snapshot struct {
	// Protocol is the client version this was recorded for. A snapshot is only
	// ever replayed to a client of exactly this version: the registry set is
	// version-specific, and there is no meaningful notion of a close-enough one.
	Protocol int32
	// Config is the run of clientbound configuration packets to replay, in the
	// order the backend sent them, up to but excluding Finish Configuration.
	// Registry data and tags are the substance of it.
	Config []protocol.Packet
	// LoginPlay is the backend's own Login (play) packet, replayed verbatim.
	//
	// Replaying it rather than building one is what keeps this package free of
	// per-version knowledge of that packet's twenty-odd fields, which have
	// changed three times in the versions covered. It also sidesteps the
	// dimension question entirely: the packet already names a dimension by its
	// index into the registry set being replayed alongside it, so the two are
	// consistent by construction.
	LoginPlay protocol.Packet
	// Source is the tag of the backend it was recorded from, and RecordedAt
	// when. Both exist to make a stale or surprising snapshot explicable.
	Source     string
	RecordedAt time.Time
	// Synthesized marks a world the proxy fetched for itself rather than
	// watching a player receive.
	//
	// Fetching one means stopping short of the moment the backend would put a
	// player in the world, because that moment is a visible join — which leaves
	// the proxy to compose the packet that does the putting, from a layout that
	// has changed three times across the versions served. Such a snapshot is
	// therefore provisional: it works, but it is the one part of the design not
	// taken from a real server, so the first real join at this version replaces
	// it with the genuine article.
	Synthesized bool
}

// Store keeps snapshots by protocol version.
//
// Implementations must be safe for concurrent use: snapshots are recorded by
// whichever connection happens to be joining a backend and read by whichever
// connection happens to need a waiting world.
type Store interface {
	// Get returns the snapshot for a protocol version, if one has been recorded.
	Get(protocolVersion int32) (*Snapshot, bool)
	// Put records a snapshot, replacing any earlier one for that version.
	Put(snap *Snapshot) error
}
