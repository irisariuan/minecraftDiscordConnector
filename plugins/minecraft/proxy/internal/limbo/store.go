package limbo

import (
	"encoding/binary"
	"errors"
	"fmt"
	"hash/crc32"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/protocol"
)

// NewMemoryStore returns a Store that forgets everything when the proxy exits.
//
// It exists for tests and for a proxy told not to keep a cache directory. The
// cost of forgetting is only a cold start: until somebody joins a running
// backend again, clients of that version get the mute hold instead of a world.
func NewMemoryStore() Store {
	return &memoryStore{snaps: make(map[int32]*Snapshot)}
}

type memoryStore struct {
	mu    sync.RWMutex
	snaps map[int32]*Snapshot
}

func (s *memoryStore) Get(protocolVersion int32) (*Snapshot, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	snap, ok := s.snaps[protocolVersion]
	return snap, ok
}

func (s *memoryStore) Put(snap *Snapshot) error {
	if snap == nil {
		return errors.New("limbo: nil snapshot")
	}
	// The caller recorded these packets off a live connection and may well go on
	// using the buffers; a copy is what makes the stored snapshot independent of
	// whatever happens to that connection next.
	stored := cloneSnapshot(snap)

	s.mu.Lock()
	defer s.mu.Unlock()
	s.snaps[stored.Protocol] = stored
	return nil
}

func (s *memoryStore) Len() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.snaps)
}

// Count reports how many snapshots a store holds, for the single line worth
// logging at startup. A Store implementation that cannot count reports zero,
// which keeps [Store] itself down to the two methods callers actually use.
func Count(s Store) int {
	if c, ok := s.(interface{ Len() int }); ok {
		return c.Len()
	}
	return 0
}

// The on-disk format.
//
// A snapshot is a handful of opaque packet payloads and three scalars, so it
// gets a small fixed-width encoding of its own rather than JSON (which would
// base64 tens of kilobytes of NBT) or gob (which ties the file to Go's
// reflection of these structs, and would then have to be defended against
// hostile input anyway).
//
// A file is a header — magic, format version, payload length and a checksum of
// the payload — followed by the payload:
//
//	int32  protocol version
//	int64  recorded-at, Unix seconds
//	uint32 recorded-at, nanoseconds within that second
//	uint32 source length, then that many bytes of UTF-8
//	packet Login (play)
//	uint32 configuration packet count, then that many packets
//
// where a packet is an int32 id, a uint32 payload length and that many bytes.
// Everything is big-endian, to match the protocol this data came off. The
// timestamp is a seconds-and-nanoseconds pair rather than one nanosecond count
// because a single int64 of nanoseconds cannot represent times outside roughly
// 1678 to 2262, and the zero [time.Time] is one of them.
//
// The checksum is not security: anyone who can write into the cache directory
// can recompute it. It is there because this file is read at startup and its
// contents are replayed to a real client, and half a registry set that parses
// is far worse than a file that is rejected outright.
const (
	// snapshotMagic identifies the file and, with snapshotFormat, makes a file
	// written by a different build of this code a clean rejection rather than a
	// misparse. Bump snapshotFormat on any layout change: old files are then
	// skipped and re-recorded, which costs one cold start and nothing else.
	snapshotMagic  = "mcproxy-limbo-snapshot\x00"
	snapshotFormat = uint32(1)

	// headerLen is the magic plus the format version, payload length and
	// checksum that follow it.
	headerLen = len(snapshotMagic) + 4 + 4 + 4

	// snapshotSuffix is both the name of a finished file and the marker that
	// tells the loader to look at it, so a temp file left behind by a crash mid
	// write is ignored rather than parsed.
	snapshotSuffix = ".snapshot"
)

// Caps on everything read out of a file, applied before anything is allocated
// on the strength of it. A cache file is ordinary local state, but it is state
// the proxy parses at startup without a second thought, and a length prefix
// read from disk deserves exactly as much suspicion as one read off a socket.
const (
	// maxSnapshotFile bounds the file as a whole. A recorded configuration
	// phase is tens of kilobytes — the registry set dominates it — so this is
	// some two orders of magnitude of headroom, and still small enough that
	// reading one into memory is uninteresting.
	maxSnapshotFile = 16 << 20

	// maxPacketLen matches what the wire reader will accept, so this can never
	// reject a recording of a packet that genuinely arrived: a backend's packet
	// reaches us through [protocol.Conn], which refuses anything larger.
	maxPacketLen = protocol.MaxUncompressedLength

	// maxConfigPackets is a generous ceiling on the configuration phase, which
	// in practice runs to a few dozen packets: the registry tables, the tag
	// set, a brand payload and a feature-flag list. The real bound is
	// maxSnapshotFile; this one keeps a corrupt count from sizing a slice.
	maxConfigPackets = 1024

	// maxSourceLen bounds the backend tag, which is a short human-facing name.
	maxSourceLen = 256
)

var (
	errBadMagic     = errors.New("limbo: not a snapshot file")
	errBadFormat    = errors.New("limbo: snapshot written by a different format version")
	errTruncated    = errors.New("limbo: snapshot file truncated")
	errChecksum     = errors.New("limbo: snapshot file failed its checksum")
	errTooLarge     = errors.New("limbo: snapshot field exceeds its cap")
	errWrongVersion = errors.New("limbo: snapshot file names a different protocol version than it contains")
)

// crcTable is Castagnoli rather than IEEE because it is what modern CPUs have
// an instruction for; the choice is baked into the format version.
var crcTable = crc32.MakeTable(crc32.Castagnoli)

// NewDiskStore returns a Store that keeps snapshots in dir, creating it if it
// is not there, and loads whatever is already in it.
//
// Everything recorded is held in memory as well, so a waiting player never
// waits on a disk read; the files exist only so that a proxy restart does not
// throw away what it learned. A file that will not parse is logged and skipped:
// the worst a damaged cache can do is put the proxy back where it was before it
// had ever seen that client version, and the caller already copes with that by
// falling back to the mute hold.
func NewDiskStore(dir string, log *slog.Logger) (Store, error) {
	if log == nil {
		log = slog.Default()
	}
	// Snapshots carry a player's session-shaped data from a backend, so the
	// directory is the owner's business and nobody else's.
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, fmt.Errorf("limbo: creating snapshot directory: %w", err)
	}
	s := &diskStore{dir: dir, log: log, snaps: make(map[int32]*Snapshot)}
	if err := s.load(); err != nil {
		return nil, err
	}
	return s, nil
}

type diskStore struct {
	dir string
	log *slog.Logger

	mu    sync.RWMutex
	snaps map[int32]*Snapshot
}

// load reads the directory once, at construction. Nothing rereads it
// afterwards: this proxy is the only writer, and a second one sharing the
// directory would be a misconfiguration rather than a case to support.
func (s *diskStore) load() error {
	entries, err := os.ReadDir(s.dir)
	if err != nil {
		return fmt.Errorf("limbo: reading snapshot directory: %w", err)
	}
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || !strings.HasSuffix(name, snapshotSuffix) {
			continue
		}
		snap, err := readSnapshotFile(filepath.Join(s.dir, name))
		if err != nil {
			// Deliberately not fatal, and deliberately not a deletion either:
			// leaving the file alone means a human can look at what went wrong,
			// and the next Put for that version replaces it anyway.
			s.log.Warn("limbo: ignoring unreadable snapshot", "file", name, "error", err)
			continue
		}
		s.snaps[snap.Protocol] = snap
	}
	return nil
}

func (s *diskStore) Get(protocolVersion int32) (*Snapshot, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	snap, ok := s.snaps[protocolVersion]
	return snap, ok
}

// Put writes the snapshot out and then replaces the cached copy.
//
// Disk first: if the write fails the caller is told, and the store keeps
// serving whatever it had rather than promising a snapshot that will not
// survive a restart.
func (s *diskStore) Put(snap *Snapshot) error {
	if snap == nil {
		return errors.New("limbo: nil snapshot")
	}
	stored := cloneSnapshot(snap)

	// Encode before touching the filesystem, so a snapshot too big to be read
	// back can never be written in the first place.
	body, err := encodeSnapshot(stored)
	if err != nil {
		return err
	}
	if err := s.writeFile(stored.Protocol, body); err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	s.snaps[stored.Protocol] = stored
	return nil
}

func (s *diskStore) Len() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.snaps)
}

// writeFile puts body at <dir>/<protocol>.snapshot without ever letting a
// reader see a partial one.
//
// The file is written under a temp name in the same directory, flushed, and
// renamed into place: rename within a directory is atomic, so a crash leaves
// either the old snapshot or the new one. That matters more here than the usual
// tidiness argument — a half-written registry set that still parsed would be
// replayed to a real client, and the client would drop the connection over it.
func (s *diskStore) writeFile(protocolVersion int32, body []byte) error {
	tmp, err := os.CreateTemp(s.dir, ".tmp-snapshot-*")
	if err != nil {
		return fmt.Errorf("limbo: creating temporary snapshot: %w", err)
	}
	name := tmp.Name()
	// Removing the temp name is harmless once the rename has consumed it, and
	// is what keeps a failure part way through from littering the directory.
	defer os.Remove(name)

	if _, err := tmp.Write(body); err != nil {
		tmp.Close()
		return fmt.Errorf("limbo: writing snapshot: %w", err)
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return fmt.Errorf("limbo: flushing snapshot: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("limbo: closing snapshot: %w", err)
	}
	if err := os.Chmod(name, 0o600); err != nil {
		return fmt.Errorf("limbo: setting snapshot permissions: %w", err)
	}
	if err := os.Rename(name, filepath.Join(s.dir, snapshotName(protocolVersion))); err != nil {
		return fmt.Errorf("limbo: installing snapshot: %w", err)
	}
	syncDir(s.dir)
	return nil
}

// syncDir flushes the directory entry the rename created, so that a machine
// that loses power just after a Put comes back up with the new snapshot rather
// than with neither. A failure here is not worth reporting: the rename has
// already happened, the in-memory copy is authoritative for this run, and the
// only thing at stake is whether one cache file survives a power cut.
func syncDir(dir string) {
	d, err := os.Open(dir)
	if err != nil {
		return
	}
	defer d.Close()
	_ = d.Sync()
}

func snapshotName(protocolVersion int32) string {
	return strconv.FormatInt(int64(protocolVersion), 10) + snapshotSuffix
}

// cloneSnapshot deep-copies a snapshot, packet payloads included, because
// [protocol.Packet] payloads alias whatever buffer they were decoded into.
func cloneSnapshot(snap *Snapshot) *Snapshot {
	out := &Snapshot{
		Protocol:   snap.Protocol,
		LoginPlay:  clonePacket(snap.LoginPlay),
		Source:     snap.Source,
		RecordedAt: snap.RecordedAt,
	}
	if len(snap.Config) > 0 {
		out.Config = make([]protocol.Packet, len(snap.Config))
		for i, pkt := range snap.Config {
			out.Config[i] = clonePacket(pkt)
		}
	}
	return out
}

// clonePacket normalises an empty payload to nil, which is what a payload of
// zero bytes comes back as when it is read from a file. Cloning the same way
// keeps the copy the store serves identical to the one a restart would load.
func clonePacket(pkt protocol.Packet) protocol.Packet {
	if len(pkt.Data) == 0 {
		return protocol.Packet{ID: pkt.ID}
	}
	data := make([]byte, len(pkt.Data))
	copy(data, pkt.Data)
	return protocol.Packet{ID: pkt.ID, Data: data}
}

// readSnapshotFile loads one file, checking that its name agrees with what is
// inside it. The name is how Put finds the file to replace, so a disagreement
// means something other than this proxy has been rearranging the directory, and
// the safe reading of that is to trust none of it.
func readSnapshotFile(path string) (*Snapshot, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	info, err := f.Stat()
	if err != nil {
		return nil, err
	}
	if info.Size() > maxSnapshotFile {
		return nil, fmt.Errorf("%w: file is %d bytes", errTooLarge, info.Size())
	}
	raw := make([]byte, info.Size())
	if _, err := io.ReadFull(f, raw); err != nil {
		return nil, err
	}

	snap, err := decodeSnapshot(raw)
	if err != nil {
		return nil, err
	}
	base := strings.TrimSuffix(filepath.Base(path), snapshotSuffix)
	named, err := strconv.ParseInt(base, 10, 32)
	if err != nil || int32(named) != snap.Protocol {
		return nil, fmt.Errorf("%w: named %s, contains %d", errWrongVersion, base, snap.Protocol)
	}
	return snap, nil
}

func encodeSnapshot(snap *Snapshot) ([]byte, error) {
	if len(snap.Source) > maxSourceLen {
		return nil, fmt.Errorf("%w: source is %d bytes", errTooLarge, len(snap.Source))
	}
	if len(snap.Config) > maxConfigPackets {
		return nil, fmt.Errorf("%w: %d configuration packets", errTooLarge, len(snap.Config))
	}

	body := make([]byte, 0, 1<<12)
	body = binary.BigEndian.AppendUint32(body, uint32(snap.Protocol))
	body = binary.BigEndian.AppendUint64(body, uint64(snap.RecordedAt.Unix()))
	body = binary.BigEndian.AppendUint32(body, uint32(snap.RecordedAt.Nanosecond()))
	body = binary.BigEndian.AppendUint32(body, uint32(len(snap.Source)))
	body = append(body, snap.Source...)
	body, err := appendPacket(body, snap.LoginPlay)
	if err != nil {
		return nil, err
	}
	body = binary.BigEndian.AppendUint32(body, uint32(len(snap.Config)))
	for _, pkt := range snap.Config {
		if body, err = appendPacket(body, pkt); err != nil {
			return nil, err
		}
	}

	out := make([]byte, 0, headerLen+len(body))
	out = append(out, snapshotMagic...)
	out = binary.BigEndian.AppendUint32(out, snapshotFormat)
	out = binary.BigEndian.AppendUint32(out, uint32(len(body)))
	out = binary.BigEndian.AppendUint32(out, crc32.Checksum(body, crcTable))
	out = append(out, body...)
	if len(out) > maxSnapshotFile {
		return nil, fmt.Errorf("%w: snapshot is %d bytes", errTooLarge, len(out))
	}
	return out, nil
}

func appendPacket(b []byte, pkt protocol.Packet) ([]byte, error) {
	if len(pkt.Data) > maxPacketLen {
		return nil, fmt.Errorf("%w: packet 0x%02x is %d bytes", errTooLarge, pkt.ID, len(pkt.Data))
	}
	b = binary.BigEndian.AppendUint32(b, uint32(pkt.ID))
	b = binary.BigEndian.AppendUint32(b, uint32(len(pkt.Data)))
	return append(b, pkt.Data...), nil
}

func decodeSnapshot(raw []byte) (*Snapshot, error) {
	if len(raw) < headerLen {
		return nil, fmt.Errorf("%w: %d bytes, header alone is %d", errTruncated, len(raw), headerLen)
	}
	if string(raw[:len(snapshotMagic)]) != snapshotMagic {
		return nil, errBadMagic
	}
	rest := raw[len(snapshotMagic):]
	if format := binary.BigEndian.Uint32(rest); format != snapshotFormat {
		return nil, fmt.Errorf("%w: found %d, want %d", errBadFormat, format, snapshotFormat)
	}
	// The declared length is checked against what is actually there before it is
	// used for anything, so a wild value is a rejection and not an allocation.
	length := binary.BigEndian.Uint32(rest[4:])
	sum := binary.BigEndian.Uint32(rest[8:])
	body := rest[12:]
	if uint64(length) != uint64(len(body)) {
		return nil, fmt.Errorf("%w: declares %d bytes of payload, has %d", errTruncated, length, len(body))
	}
	if crc32.Checksum(body, crcTable) != sum {
		return nil, errChecksum
	}

	d := decoder{b: body}
	protocolVersion, err := d.int32()
	if err != nil {
		return nil, err
	}
	seconds, err := d.int64()
	if err != nil {
		return nil, err
	}
	nanos, err := d.uint32()
	if err != nil {
		return nil, err
	}
	source, err := d.text(maxSourceLen)
	if err != nil {
		return nil, err
	}
	loginPlay, err := d.packet()
	if err != nil {
		return nil, err
	}
	count, err := d.count(maxConfigPackets, packetHeaderLen)
	if err != nil {
		return nil, err
	}
	// Left nil when there is nothing to hold, so that a snapshot survives a
	// round trip through a file unchanged rather than coming back subtly
	// different from the one that was recorded.
	var config []protocol.Packet
	if count > 0 {
		config = make([]protocol.Packet, count)
		for i := range config {
			if config[i], err = d.packet(); err != nil {
				return nil, err
			}
		}
	}
	if d.left() != 0 {
		return nil, fmt.Errorf("%w: %d bytes of trailing data", errTruncated, d.left())
	}

	return &Snapshot{
		Protocol:   protocolVersion,
		Config:     config,
		LoginPlay:  loginPlay,
		Source:     source,
		RecordedAt: time.Unix(seconds, int64(nanos)).UTC(),
	}, nil
}

// packetHeaderLen is the id and length that precede every packet payload, and
// so the smallest a packet can be on disk.
const packetHeaderLen = 8

// decoder walks a snapshot payload. Every read is bounded twice: against the
// field's own cap, which says what this proxy considers plausible, and against
// the bytes actually left in the buffer, which is what stops a doctored length
// prefix from turning into an allocation nobody asked for.
type decoder struct {
	b []byte
	i int
}

func (d *decoder) left() int { return len(d.b) - d.i }

func (d *decoder) take(n int) ([]byte, error) {
	if d.left() < n {
		return nil, fmt.Errorf("%w: wanted %d bytes, %d left", errTruncated, n, d.left())
	}
	b := d.b[d.i : d.i+n]
	d.i += n
	return b, nil
}

func (d *decoder) uint32() (uint32, error) {
	b, err := d.take(4)
	if err != nil {
		return 0, err
	}
	return binary.BigEndian.Uint32(b), nil
}

func (d *decoder) int32() (int32, error) {
	v, err := d.uint32()
	return int32(v), err
}

func (d *decoder) int64() (int64, error) {
	b, err := d.take(8)
	if err != nil {
		return 0, err
	}
	return int64(binary.BigEndian.Uint64(b)), nil
}

// length reads a length prefix and refuses it if it is past either cap or the
// end of the buffer, before the caller gets a chance to allocate on it.
func (d *decoder) length(max int) (int, error) {
	n, err := d.uint32()
	if err != nil {
		return 0, err
	}
	if uint64(n) > uint64(max) {
		return 0, fmt.Errorf("%w: declared %d, cap is %d", errTooLarge, n, max)
	}
	if uint64(n) > uint64(d.left()) {
		return 0, fmt.Errorf("%w: declared %d bytes, %d left", errTruncated, n, d.left())
	}
	return int(n), nil
}

// count reads an element count, where each element occupies at least unit bytes
// on disk. Checking the implied minimum size rejects a count that no file this
// short could honour, rather than sizing a slice for it and failing later.
func (d *decoder) count(max, unit int) (int, error) {
	n, err := d.uint32()
	if err != nil {
		return 0, err
	}
	if uint64(n) > uint64(max) {
		return 0, fmt.Errorf("%w: declared %d elements, cap is %d", errTooLarge, n, max)
	}
	if uint64(n)*uint64(unit) > uint64(d.left()) {
		return 0, fmt.Errorf("%w: declared %d elements, only %d bytes left", errTruncated, n, d.left())
	}
	return int(n), nil
}

func (d *decoder) text(max int) (string, error) {
	n, err := d.length(max)
	if err != nil {
		return "", err
	}
	b, err := d.take(n)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func (d *decoder) packet() (protocol.Packet, error) {
	id, err := d.int32()
	if err != nil {
		return protocol.Packet{}, err
	}
	n, err := d.length(maxPacketLen)
	if err != nil {
		return protocol.Packet{}, err
	}
	b, err := d.take(n)
	if err != nil {
		return protocol.Packet{}, err
	}
	if n == 0 {
		return protocol.Packet{ID: id}, nil
	}
	// The payload is copied out of the file buffer so that the whole file can be
	// released once the snapshots in it are held.
	data := make([]byte, n)
	copy(data, b)
	return protocol.Packet{ID: id, Data: data}, nil
}
