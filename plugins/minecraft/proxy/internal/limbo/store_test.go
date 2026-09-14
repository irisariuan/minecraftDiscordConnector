package limbo

import (
	"bytes"
	"encoding/binary"
	"errors"
	"fmt"
	"hash/crc32"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/protocol"
)

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func sampleSnapshot(protocolVersion int32) *Snapshot {
	return &Snapshot{
		Protocol: protocolVersion,
		Config: []protocol.Packet{
			{ID: 0x07, Data: []byte("registry data, pretend this is NBT")},
			{ID: 0x0d, Data: bytes.Repeat([]byte{0xab, 0x00, 0x7f}, 5000)},
			{ID: 0x01, Data: nil},
		},
		LoginPlay:  protocol.Packet{ID: 0x2b, Data: []byte{0, 0, 0, 1, 0xff, 0xfe}},
		Source:     "survival",
		RecordedAt: time.Date(2024, 5, 1, 12, 30, 15, 123456789, time.UTC),
	}
}

// assertSame compares every field, packet payloads included, because the whole
// point of the cache is that what comes back is byte for byte what a backend
// sent: a snapshot that differs anywhere is one a client may refuse.
func assertSame(t *testing.T, got, want *Snapshot) {
	t.Helper()
	if got == nil {
		t.Fatal("no snapshot")
	}
	if got.Protocol != want.Protocol {
		t.Errorf("protocol = %d, want %d", got.Protocol, want.Protocol)
	}
	if got.Source != want.Source {
		t.Errorf("source = %q, want %q", got.Source, want.Source)
	}
	if !got.RecordedAt.Equal(want.RecordedAt) {
		t.Errorf("recorded at = %v, want %v", got.RecordedAt, want.RecordedAt)
	}
	assertSamePacket(t, "login play", got.LoginPlay, want.LoginPlay)
	if len(got.Config) != len(want.Config) {
		t.Fatalf("config has %d packets, want %d", len(got.Config), len(want.Config))
	}
	for i := range want.Config {
		assertSamePacket(t, fmt.Sprintf("config packet %d", i), got.Config[i], want.Config[i])
	}
}

func assertSamePacket(t *testing.T, what string, got, want protocol.Packet) {
	t.Helper()
	if got.ID != want.ID {
		t.Errorf("%s: id = 0x%02x, want 0x%02x", what, got.ID, want.ID)
	}
	if !bytes.Equal(got.Data, want.Data) {
		t.Errorf("%s: payload is %d bytes, want %d (contents differ)", what, len(got.Data), len(want.Data))
	}
}

func TestDiskStoreRoundTrip(t *testing.T) {
	dir := t.TempDir()
	want := sampleSnapshot(767)

	first, err := NewDiskStore(dir, discardLogger())
	if err != nil {
		t.Fatalf("NewDiskStore: %v", err)
	}
	if err := first.Put(want); err != nil {
		t.Fatalf("Put: %v", err)
	}
	got, ok := first.Get(767)
	if !ok {
		t.Fatal("the store that just recorded it does not have it")
	}
	assertSame(t, got, want)

	second, err := NewDiskStore(dir, discardLogger())
	if err != nil {
		t.Fatalf("reopening: %v", err)
	}
	if n := Count(second); n != 1 {
		t.Errorf("reopened store holds %d snapshots, want 1", n)
	}
	got, ok = second.Get(767)
	if !ok {
		t.Fatal("the reopened store does not have it")
	}
	assertSame(t, got, want)
}

// The store must not keep the caller's buffers: a recording is taken off a live
// connection and the caller is free to reuse what it handed over.
func TestPutCopiesTheCallerBuffers(t *testing.T) {
	dir := t.TempDir()
	s, err := NewDiskStore(dir, discardLogger())
	if err != nil {
		t.Fatalf("NewDiskStore: %v", err)
	}
	snap := sampleSnapshot(767)
	if err := s.Put(snap); err != nil {
		t.Fatalf("Put: %v", err)
	}
	snap.Config[0].Data[0] = 'X'
	snap.LoginPlay.Data[0] = 'X'

	got, _ := s.Get(767)
	if got.Config[0].Data[0] == 'X' || got.LoginPlay.Data[0] == 'X' {
		t.Error("mutating the snapshot after Put changed what the store serves")
	}
}

func TestSnapshotIsOnlyServedToItsOwnProtocol(t *testing.T) {
	dir := t.TempDir()
	s, err := NewDiskStore(dir, discardLogger())
	if err != nil {
		t.Fatalf("NewDiskStore: %v", err)
	}
	if err := s.Put(sampleSnapshot(767)); err != nil {
		t.Fatalf("Put: %v", err)
	}
	for _, other := range []int32{0, 766, 768, -767} {
		if _, ok := s.Get(other); ok {
			t.Errorf("Get(%d) answered with the snapshot recorded for 767", other)
		}
	}

	reopened, err := NewDiskStore(dir, discardLogger())
	if err != nil {
		t.Fatalf("reopening: %v", err)
	}
	if _, ok := reopened.Get(766); ok {
		t.Error("Get(766) answered after a reload")
	}
}

// frame wraps a payload in a well-formed header, so that a test can put
// deliberate nonsense inside a file that is otherwise beyond reproach.
func frame(body []byte) []byte {
	out := append([]byte(nil), snapshotMagic...)
	out = binary.BigEndian.AppendUint32(out, snapshotFormat)
	out = binary.BigEndian.AppendUint32(out, uint32(len(body)))
	out = binary.BigEndian.AppendUint32(out, crc32.Checksum(body, crcTable))
	return append(out, body...)
}

func TestCorruptFilesAreSkippedAndTheRestStillLoad(t *testing.T) {
	dir := t.TempDir()
	seed, err := NewDiskStore(dir, discardLogger())
	if err != nil {
		t.Fatalf("NewDiskStore: %v", err)
	}
	good := sampleSnapshot(767)
	if err := seed.Put(good); err != nil {
		t.Fatalf("Put: %v", err)
	}
	valid, err := os.ReadFile(filepath.Join(dir, "767.snapshot"))
	if err != nil {
		t.Fatalf("reading back the good file: %v", err)
	}

	wrongMagic := append([]byte(nil), valid...)
	copy(wrongMagic, "mcproxy-limbo-OTHER\x00\x00\x00\x00")

	wrongFormat := append([]byte(nil), valid...)
	binary.BigEndian.PutUint32(wrongFormat[len(snapshotMagic):], snapshotFormat+1)

	flipped := append([]byte(nil), valid...)
	flipped[len(flipped)-1] ^= 0xff

	for name, content := range map[string][]byte{
		"760.snapshot":          valid[:len(valid)/2],
		"761.snapshot":          wrongMagic,
		"762.snapshot":          wrongFormat,
		"763.snapshot":          []byte("this is not a snapshot, it is a note to self"),
		"764.snapshot":          nil,
		"765.snapshot":          flipped,
		"766.snapshot":          valid, // right contents, wrong name
		"not-a-number.snapshot": valid,
	} {
		if err := os.WriteFile(filepath.Join(dir, name), content, 0o600); err != nil {
			t.Fatalf("writing %s: %v", name, err)
		}
	}
	// Files that are not snapshots at all must not even be looked at.
	if err := os.WriteFile(filepath.Join(dir, "README"), []byte("hello"), 0o600); err != nil {
		t.Fatalf("writing README: %v", err)
	}
	if err := os.Mkdir(filepath.Join(dir, "768.snapshot"), 0o700); err != nil {
		t.Fatalf("making a directory in the way: %v", err)
	}

	var logged bytes.Buffer
	log := slog.New(slog.NewTextHandler(&logged, nil))
	s, err := NewDiskStore(dir, log)
	if err != nil {
		t.Fatalf("a directory full of rubbish must still construct: %v", err)
	}
	if n := Count(s); n != 1 {
		t.Errorf("store holds %d snapshots, want only the good one", n)
	}
	got, ok := s.Get(767)
	if !ok {
		t.Fatal("the good snapshot was lost among the bad ones")
	}
	assertSame(t, got, good)

	for _, bad := range []string{"760", "761", "762", "763", "764", "765", "766"} {
		if !strings.Contains(logged.String(), bad+".snapshot") {
			t.Errorf("%s.snapshot was skipped without a word about it", bad)
		}
	}
}

func TestAbsurdLengthPrefixesAreRejectedBeforeAllocating(t *testing.T) {
	head := func() []byte {
		b := binary.BigEndian.AppendUint32(nil, uint32(767))
		b = binary.BigEndian.AppendUint64(b, uint64(time.Now().Unix()))
		return binary.BigEndian.AppendUint32(b, 0)
	}
	// Everything from the Login (play) packet onwards sits behind an empty
	// source and the byte recording whether that packet was composed.
	pastSource := func() []byte {
		return append(binary.BigEndian.AppendUint32(head(), 0), 0)
	}

	t.Run("source", func(t *testing.T) {
		body := binary.BigEndian.AppendUint32(head(), 0xfffffff0)
		assertRejected(t, frame(body), errTooLarge)
	})

	t.Run("packet payload", func(t *testing.T) {
		body := pastSource()
		body = binary.BigEndian.AppendUint32(body, 0x2b) // login play id
		body = binary.BigEndian.AppendUint32(body, 0x7fffffff)
		assertRejected(t, frame(body), errTooLarge)
	})

	t.Run("configuration packet count", func(t *testing.T) {
		body := pastSource()
		body = binary.BigEndian.AppendUint32(body, 0x2b)
		body = binary.BigEndian.AppendUint32(body, 0) // empty login play
		body = binary.BigEndian.AppendUint32(body, 0xffffffff)
		assertRejected(t, frame(body), errTooLarge)
	})

	t.Run("payload length in the header", func(t *testing.T) {
		file := frame(head())
		binary.BigEndian.PutUint32(file[len(snapshotMagic)+4:], 0xffffffff)
		assertRejected(t, file, errTruncated)
	})

	t.Run("a packet that claims the rest of the file twice over", func(t *testing.T) {
		body := pastSource()
		body = binary.BigEndian.AppendUint32(body, 0x2b)
		body = binary.BigEndian.AppendUint32(body, uint32(maxPacketLen-1))
		assertRejected(t, frame(body), errTruncated)
	})
}

func assertRejected(t *testing.T, file []byte, want error) {
	t.Helper()
	snap, err := decodeSnapshot(file)
	if err == nil {
		t.Fatalf("decoded a file it should have refused: %+v", snap)
	}
	if !errors.Is(err, want) {
		t.Fatalf("error is %v, want one wrapping %v", err, want)
	}
}

// A file bigger than the cap must be refused on its stated size, without being
// read into memory first.
func TestOversizeFileIsRefusedWithoutReadingIt(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "767.snapshot")
	f, err := os.Create(path)
	if err != nil {
		t.Fatalf("creating: %v", err)
	}
	// A sparse file: the bytes are never written, so the test does not need the
	// disk space to describe something absurd.
	if err := f.Truncate(maxSnapshotFile + 1); err != nil {
		t.Fatalf("truncating: %v", err)
	}
	f.Close()

	if _, err := readSnapshotFile(path); !errors.Is(err, errTooLarge) {
		t.Fatalf("error is %v, want one wrapping %v", err, errTooLarge)
	}

	s, err := NewDiskStore(dir, discardLogger())
	if err != nil {
		t.Fatalf("NewDiskStore: %v", err)
	}
	if n := Count(s); n != 0 {
		t.Errorf("store holds %d snapshots, want 0", n)
	}
}

func TestPutLeavesNoTemporaryFilesBehind(t *testing.T) {
	dir := t.TempDir()
	s, err := NewDiskStore(dir, discardLogger())
	if err != nil {
		t.Fatalf("NewDiskStore: %v", err)
	}
	for _, v := range []int32{765, 766, 767} {
		if err := s.Put(sampleSnapshot(v)); err != nil {
			t.Fatalf("Put(%d): %v", v, err)
		}
	}
	// Replacing an existing one is the case most likely to leave something
	// behind, so do it twice.
	if err := s.Put(sampleSnapshot(767)); err != nil {
		t.Fatalf("replacing 767: %v", err)
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("ReadDir: %v", err)
	}
	var names []string
	for _, e := range entries {
		names = append(names, e.Name())
	}
	if len(names) != 3 {
		t.Fatalf("directory holds %v, want exactly the three snapshots", names)
	}
	for _, name := range names {
		if !strings.HasSuffix(name, snapshotSuffix) {
			t.Errorf("%s is not a finished snapshot", name)
		}
	}
}

// A torn file must be impossible to observe, so the rename has to be the only
// way a reader ever sees new content. Nothing here can prove atomicity outright;
// what it can do is check that every file visible in the directory while writes
// are in flight is a whole, loadable snapshot.
func TestAReaderNeverSeesAHalfWrittenFile(t *testing.T) {
	dir := t.TempDir()
	s, err := NewDiskStore(dir, discardLogger())
	if err != nil {
		t.Fatalf("NewDiskStore: %v", err)
	}

	done := make(chan struct{})
	go func() {
		defer close(done)
		for i := 0; i < 50; i++ {
			snap := sampleSnapshot(767)
			snap.Source = strings.Repeat("x", i%maxSourceLen)
			if err := s.Put(snap); err != nil {
				t.Errorf("Put: %v", err)
				return
			}
		}
	}()

	for {
		select {
		case <-done:
			return
		default:
		}
		entries, err := os.ReadDir(dir)
		if err != nil {
			t.Fatalf("ReadDir: %v", err)
		}
		for _, e := range entries {
			if !strings.HasSuffix(e.Name(), snapshotSuffix) {
				continue
			}
			if _, err := readSnapshotFile(filepath.Join(dir, e.Name())); err != nil {
				t.Fatalf("a file visible mid-write did not load: %v", err)
			}
		}
	}
}

func TestConcurrentGetAndPut(t *testing.T) {
	for _, tc := range []struct {
		name  string
		build func(t *testing.T) Store
	}{
		{"memory", func(t *testing.T) Store { return NewMemoryStore() }},
		{"disk", func(t *testing.T) Store {
			s, err := NewDiskStore(t.TempDir(), discardLogger())
			if err != nil {
				t.Fatalf("NewDiskStore: %v", err)
			}
			return s
		}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s := tc.build(t)
			versions := []int32{765, 766, 767, 768}

			var wg sync.WaitGroup
			for _, v := range versions {
				wg.Add(2)
				go func(v int32) {
					defer wg.Done()
					for i := 0; i < 20; i++ {
						if err := s.Put(sampleSnapshot(v)); err != nil {
							t.Errorf("Put(%d): %v", v, err)
							return
						}
					}
				}(v)
				go func(v int32) {
					defer wg.Done()
					for i := 0; i < 200; i++ {
						if snap, ok := s.Get(v); ok && snap.Protocol != v {
							t.Errorf("Get(%d) returned protocol %d", v, snap.Protocol)
							return
						}
					}
				}(v)
			}
			wg.Wait()

			for _, v := range versions {
				snap, ok := s.Get(v)
				if !ok {
					t.Fatalf("Get(%d) found nothing after all those writes", v)
				}
				assertSame(t, snap, sampleSnapshot(v))
			}
		})
	}
}

func TestMemoryStore(t *testing.T) {
	s := NewMemoryStore()
	if _, ok := s.Get(767); ok {
		t.Error("a fresh store answered a Get")
	}
	want := sampleSnapshot(767)
	if err := s.Put(want); err != nil {
		t.Fatalf("Put: %v", err)
	}
	got, ok := s.Get(767)
	if !ok {
		t.Fatal("Get found nothing")
	}
	assertSame(t, got, want)
	if n := Count(s); n != 1 {
		t.Errorf("Count = %d, want 1", n)
	}
	if err := s.Put(nil); err == nil {
		t.Error("Put(nil) was accepted")
	}
}

func TestPutRefusesWhatItCouldNotReadBack(t *testing.T) {
	dir := t.TempDir()
	s, err := NewDiskStore(dir, discardLogger())
	if err != nil {
		t.Fatalf("NewDiskStore: %v", err)
	}

	tooManyPackets := sampleSnapshot(767)
	tooManyPackets.Config = make([]protocol.Packet, maxConfigPackets+1)
	if err := s.Put(tooManyPackets); !errors.Is(err, errTooLarge) {
		t.Errorf("error is %v, want one wrapping %v", err, errTooLarge)
	}

	longSource := sampleSnapshot(767)
	longSource.Source = strings.Repeat("s", maxSourceLen+1)
	if err := s.Put(longSource); !errors.Is(err, errTooLarge) {
		t.Errorf("error is %v, want one wrapping %v", err, errTooLarge)
	}

	if err := s.Put(nil); err == nil {
		t.Error("Put(nil) was accepted")
	}
	if entries, _ := os.ReadDir(dir); len(entries) != 0 {
		t.Errorf("a refused Put left %d files behind", len(entries))
	}
}

// An empty snapshot is not useful, but it must survive a round trip: the
// decoder distinguishes "nothing recorded" from "file ended early", and this is
// the case where those two look alike.
func TestEmptySnapshotRoundTrips(t *testing.T) {
	dir := t.TempDir()
	s, err := NewDiskStore(dir, discardLogger())
	if err != nil {
		t.Fatalf("NewDiskStore: %v", err)
	}
	want := &Snapshot{Protocol: 47}
	if err := s.Put(want); err != nil {
		t.Fatalf("Put: %v", err)
	}
	reopened, err := NewDiskStore(dir, discardLogger())
	if err != nil {
		t.Fatalf("reopening: %v", err)
	}
	got, ok := reopened.Get(47)
	if !ok {
		t.Fatal("an empty snapshot did not come back")
	}
	if len(got.Config) != 0 || got.Source != "" || len(got.LoginPlay.Data) != 0 {
		t.Errorf("empty snapshot came back as %+v", got)
	}
	if !got.RecordedAt.Equal(want.RecordedAt) {
		t.Errorf("recorded at = %v, want the zero time %v", got.RecordedAt, want.RecordedAt)
	}
}
