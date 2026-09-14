package route

import (
	"bytes"
	"fmt"
	"io"
	"log/slog"
	"net"
	"sync"
	"testing"
	"time"

	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/control"
	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/limbo"
	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/protocol"
)

// These tests put a real connection on each side of [Proxy.recordJoin]: one
// pipe standing in for the player, one for the backend, with a protocol.Conn on
// both ends of each. Nothing is faked below the wire, because the thing most
// worth pinning here is the handover from packet mode to the byte copy, and a
// stub that never framed anything could not show it going wrong.

// captureProtocol is the client version the recordings in this file are taken
// for. 772 covers both 1.21.7 and 1.21.8, which is the ambiguity that makes the
// known-packs rewrite necessary in the first place.
const captureProtocol = 772

// capturePlayLogin is the clientbound play-phase Login id. The capture never
// looks at it — whatever follows Finish Configuration is the Login (play) — so
// it is only here to make the scripts below readable.
const capturePlayLogin = 0x2B

// captureRig drives one recordJoin call and gives the test the far end of both
// connections.
type captureRig struct {
	t *testing.T

	// player and backend are the test's ends: what a real client would read
	// and what a real backend would write.
	player  *protocol.Conn
	backend *protocol.Conn

	backendRaw net.Conn

	sends sync.WaitGroup
	errs  chan error
	done  chan captureOutcome
}

type captureOutcome struct {
	snap *limbo.Snapshot
	err  error
}

func newCaptureRig(t *testing.T) *captureRig {
	t.Helper()

	proxyToPlayer, playerRaw := net.Pipe()
	proxyToBackend, backendRaw := net.Pipe()
	conns := []net.Conn{proxyToPlayer, playerRaw, proxyToBackend, backendRaw}
	deadline := time.Now().Add(unitPipeTimeout)
	for _, c := range conns {
		_ = c.SetDeadline(deadline)
	}
	t.Cleanup(func() {
		for _, c := range conns {
			_ = c.Close()
		}
	})

	rig := &captureRig{
		t:          t,
		player:     protocol.NewConn(playerRaw),
		backend:    protocol.NewConn(backendRaw),
		backendRaw: backendRaw,
		errs:       make(chan error, 8),
		done:       make(chan captureOutcome, 1),
	}

	p := &Proxy{log: slog.New(slog.NewTextHandler(io.Discard, nil))}
	entry := control.ServerEntry{ID: 1, Tag: "Survival"}
	go func() {
		snap, err := p.recordJoin(
			protocol.NewConn(proxyToPlayer),
			protocol.NewConn(proxyToBackend),
			captureProtocol,
			entry,
		)
		rig.done <- captureOutcome{snap: snap, err: err}
	}()
	return rig
}

// fromBackend and fromPlayer script one side's traffic. They write from their
// own goroutine because net.Pipe holds a write until the far end reads it, so a
// script and the reads it feeds have to run at the same time.
func (r *captureRig) fromBackend(pkts ...*protocol.Packet) { r.script("backend", r.backend, pkts) }
func (r *captureRig) fromPlayer(pkts ...*protocol.Packet)  { r.script("player", r.player, pkts) }

func (r *captureRig) script(who string, conn *protocol.Conn, pkts []*protocol.Packet) {
	r.sends.Add(1)
	go func() {
		defer r.sends.Done()
		for _, pkt := range pkts {
			if err := conn.WritePacket(pkt); err != nil {
				r.fail(fmt.Errorf("%s writing 0x%02x: %w", who, pkt.ID, err))
				return
			}
		}
	}()
}

// rawFromBackend and rawFromPlayer write unframed bytes, as a peer does once
// the proxy has stopped decoding its stream.
func (r *captureRig) rawFromBackend(b []byte) { r.scriptRaw("backend", r.backend, b) }
func (r *captureRig) rawFromPlayer(b []byte)  { r.scriptRaw("player", r.player, b) }

func (r *captureRig) scriptRaw(who string, conn *protocol.Conn, b []byte) {
	r.sends.Add(1)
	go func() {
		defer r.sends.Done()
		if _, err := conn.StreamWriter().Write(b); err != nil {
			r.fail(fmt.Errorf("%s writing raw bytes: %w", who, err))
		}
	}()
}

func (r *captureRig) fail(err error) {
	select {
	case r.errs <- err:
	default:
	}
}

// expectPlayer and expectBackend read one packet from the far end and assert
// its id.
func (r *captureRig) expectPlayer(id int32) *protocol.Packet {
	r.t.Helper()
	return r.expect("player", r.player, id)
}

func (r *captureRig) expectBackend(id int32) *protocol.Packet {
	r.t.Helper()
	return r.expect("backend", r.backend, id)
}

func (r *captureRig) expect(who string, conn *protocol.Conn, id int32) *protocol.Packet {
	r.t.Helper()

	pkt, err := conn.ReadPacket()
	if err != nil {
		r.t.Fatalf("%s reading a packet (wanted 0x%02x): %v", who, id, err)
	}
	if pkt.ID != id {
		r.t.Fatalf("%s got packet 0x%02x, wanted 0x%02x", who, pkt.ID, id)
	}
	return pkt
}

// expectRaw reads exactly len(want) unframed bytes from the far end.
func (r *captureRig) expectRaw(who string, conn *protocol.Conn, want []byte) {
	r.t.Helper()

	got := make([]byte, len(want))
	if _, err := io.ReadFull(conn.StreamReader(), got); err != nil {
		r.t.Fatalf("%s reading %d raw bytes: %v", who, len(want), err)
	}
	if !bytes.Equal(got, want) {
		r.t.Errorf("%s received %q after the handover, wanted %q", who, got, want)
	}
}

// finish ends the session and returns what recordJoin made of it. Hanging up
// the backend is what a player quitting or a server stopping looks like, and it
// is the only way the copy at the end of recordJoin ever returns.
func (r *captureRig) finish() (*limbo.Snapshot, error) {
	r.t.Helper()

	r.waitForScripts()
	_ = r.backendRaw.Close()

	select {
	case out := <-r.done:
		select {
		case err := <-r.errs:
			r.t.Fatalf("scripted traffic failed: %v", err)
		default:
		}
		return out.snap, out.err
	case <-time.After(unitPipeTimeout):
		r.t.Fatal("recordJoin never returned")
		return nil, nil
	}
}

func (r *captureRig) waitForScripts() {
	r.t.Helper()

	done := make(chan struct{})
	go func() {
		r.sends.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(unitPipeTimeout):
		r.t.Fatal("a scripted write never completed: something the test sent was never read")
	}
}

// completeClientConfiguration plays the client's side of the configuration
// phase: the login acknowledgement, then the acknowledgement that ends
// configuration. A recording is only kept when this direction was seen through
// to the end, because that is the proof that no un-emptied known-packs reply
// slipped past to the backend.
func (r *captureRig) completeClientConfiguration() {
	r.t.Helper()
	r.fromPlayer(
		capturePacket(idAckFinishConfiguration, ""), // login acknowledged
		capturePacket(idAckFinishConfiguration, ""), // end of configuration
	)
	r.expectBackend(idAckFinishConfiguration)
	r.expectBackend(idAckFinishConfiguration)
}

func capturePacket(id int32, body string) *protocol.Packet {
	return &protocol.Packet{ID: id, Data: []byte(body)}
}

// expectRecorded asserts the snapshot holds exactly these packets, in order.
func expectRecorded(t *testing.T, snap *limbo.Snapshot, want []*protocol.Packet) {
	t.Helper()

	if snap == nil {
		t.Fatal("nothing was recorded")
	}
	if len(snap.Config) != len(want) {
		t.Fatalf("recorded %d configuration packets, wanted %d", len(snap.Config), len(want))
	}
	for i, w := range want {
		got := snap.Config[i]
		if got.ID != w.ID || !bytes.Equal(got.Data, w.Data) {
			t.Errorf("recorded packet %d is 0x%02x %q, wanted 0x%02x %q",
				i, got.ID, got.Data, w.ID, w.Data)
		}
	}
}

// TestRecordJoinRecordsTheWorldDescribingPackets is the ordinary recording: a
// backend's registry set goes past on its way to a real player and is written
// down in the order it was sent.
func TestRecordJoinRecordsTheWorldDescribingPackets(t *testing.T) {
	t.Parallel()

	rig := newCaptureRig(t)
	rig.completeClientConfiguration()

	data := []*protocol.Packet{
		capturePacket(idRegistryData, "minecraft:dimension_type"),
		capturePacket(idRegistryData, "minecraft:worldgen/biome"),
		capturePacket(idUpdateTags, "tags"),
		capturePacket(idRegistryData, "minecraft:damage_type"),
		capturePacket(idUpdateEnabledFeatures, "vanilla"),
	}
	login := capturePacket(capturePlayLogin, "the world the player is entering")

	script := append([]*protocol.Packet(nil), data...)
	script = append(script, capturePacket(idFinishConfiguration, ""), login)
	rig.fromBackend(script...)

	for _, want := range script {
		got := rig.expectPlayer(want.ID)
		if !bytes.Equal(got.Data, want.Data) {
			t.Errorf("the player received 0x%02x as %q, wanted %q", got.ID, got.Data, want.Data)
		}
	}

	snap, err := rig.finish()
	if err != nil {
		t.Fatalf("recordJoin: %v", err)
	}
	expectRecorded(t, snap, data)

	if snap.LoginPlay.ID != login.ID || !bytes.Equal(snap.LoginPlay.Data, login.Data) {
		t.Errorf("recorded login (play) 0x%02x %q, wanted 0x%02x %q",
			snap.LoginPlay.ID, snap.LoginPlay.Data, login.ID, login.Data)
	}
	if snap.Protocol != captureProtocol {
		t.Errorf("snapshot is for protocol %d, wanted %d", snap.Protocol, captureProtocol)
	}
	if snap.Source != "Survival" {
		t.Errorf("snapshot names %q as its source, wanted %q", snap.Source, "Survival")
	}
	if snap.RecordedAt.IsZero() {
		t.Error("the snapshot does not say when it was recorded")
	}
}

// TestRecordJoinForwardsConnectionPacketsWithoutRecordingThem covers the other
// half of the whitelist. Every one of these reaches the player, because the
// backend meant it for them, and none of them is kept, because saying any of it
// again to somebody else would be wrong.
func TestRecordJoinForwardsConnectionPacketsWithoutRecordingThem(t *testing.T) {
	t.Parallel()

	rig := newCaptureRig(t)
	rig.completeClientConfiguration()

	registry := capturePacket(idRegistryData, "minecraft:dimension_type")
	script := []*protocol.Packet{
		capturePacket(0x00, "cookie request"),
		capturePacket(0x01, "plugin message"),
		capturePacket(0x04, "keep alive"),
		capturePacket(0x05, "ping"),
		capturePacket(0x06, "reset chat"),
		registry,
		capturePacket(0x08, "resource pack pop"),
		capturePacket(0x09, "resource pack push"),
		capturePacket(0x0A, "store cookie"),
		capturePacket(0x0B, "transfer"),
		capturePacket(0x0E, "known packs"),
		capturePacket(0x0F, "custom report details"),
		capturePacket(0x10, "server links"),
		capturePacket(0x7A, "an id from a version that does not exist yet"),
		capturePacket(idFinishConfiguration, ""),
		capturePacket(capturePlayLogin, "login"),
	}
	rig.fromBackend(script...)

	for _, want := range script {
		got := rig.expectPlayer(want.ID)
		if !bytes.Equal(got.Data, want.Data) {
			t.Errorf("the player received 0x%02x as %q, wanted %q", got.ID, got.Data, want.Data)
		}
	}

	snap, err := rig.finish()
	if err != nil {
		t.Fatalf("recordJoin: %v", err)
	}
	expectRecorded(t, snap, []*protocol.Packet{registry})
}

// TestRecordJoinHandsTheBackendStreamOverWithoutLosingBytes covers the risky
// moment: the point where the proxy stops decoding the backend and starts
// copying it. Anything the backend pipelined behind Login (play) has already
// been read off the socket by then, and losing it would leave the player in a
// world missing whatever it was.
func TestRecordJoinHandsTheBackendStreamOverWithoutLosingBytes(t *testing.T) {
	t.Parallel()

	rig := newCaptureRig(t)

	rig.fromBackend(
		capturePacket(idRegistryData, "minecraft:dimension_type"),
		capturePacket(idFinishConfiguration, ""),
		capturePacket(capturePlayLogin, "login"),
		capturePacket(0x22, "chunk data"),
		capturePacket(0x40, "set default spawn position"),
	)

	rig.expectPlayer(idRegistryData)
	rig.expectPlayer(idFinishConfiguration)
	rig.expectPlayer(capturePlayLogin)

	chunk := rig.expectPlayer(0x22)
	if string(chunk.Data) != "chunk data" {
		t.Errorf("the packet after login (play) arrived as %q", chunk.Data)
	}
	spawn := rig.expectPlayer(0x40)
	if string(spawn.Data) != "set default spawn position" {
		t.Errorf("the second packet after login (play) arrived as %q", spawn.Data)
	}

	// The copy is a byte copy, so bytes that are not a packet at all must come
	// through it just as faithfully.
	trailing := []byte("bytes the framer never sees")
	rig.rawFromBackend(trailing)
	rig.expectRaw("player", rig.player, trailing)

	if _, err := rig.finish(); err != nil {
		t.Fatalf("recordJoin: %v", err)
	}
}

// TestRecordedPacketsDoNotAliasTheReadBuffer guards the copy in clonePacket.
//
// Nothing in the live path can show this up today, because protocol.Conn
// allocates a fresh frame for every packet and an aliased payload therefore
// survives by luck. A snapshot outlives the connection it came from by hours,
// though, so this is the test that fails the day the reader starts reusing its
// buffer — rather than a waiting player's registry set quietly turning into the
// bytes of whatever arrived next.
func TestRecordedPacketsDoNotAliasTheReadBuffer(t *testing.T) {
	t.Parallel()

	buf := []byte("minecraft:dimension_type")
	kept := clonePacket(&protocol.Packet{ID: idRegistryData, Data: buf})
	for i := range buf {
		buf[i] = 'x'
	}

	if string(kept.Data) != "minecraft:dimension_type" {
		t.Errorf("the recorded payload became %q when the read buffer was reused", kept.Data)
	}
}

// TestRecordJoinGivesUpOnTooManyConfigurationPackets is the rule that outranks
// the recording: a backend that talks past every plausible configuration phase
// costs the player their snapshot, never their join.
func TestRecordJoinGivesUpOnTooManyConfigurationPackets(t *testing.T) {
	t.Parallel()

	rig := newCaptureRig(t)

	var script []*protocol.Packet
	for i := 0; i < maxCaptureConfigPackets+2; i++ {
		script = append(script, capturePacket(idRegistryData, fmt.Sprintf("registry %d", i)))
	}
	script = append(script,
		capturePacket(idFinishConfiguration, ""),
		capturePacket(capturePlayLogin, "login"))
	rig.fromBackend(script...)

	// Every packet still reaches the player: the ones before the limit through
	// the recorder, the ones after it through the copy that replaced it.
	for _, want := range script {
		got := rig.expectPlayer(want.ID)
		if !bytes.Equal(got.Data, want.Data) {
			t.Errorf("the player received 0x%02x as %q, wanted %q", got.ID, got.Data, want.Data)
		}
	}

	snap, err := rig.finish()
	if err != nil {
		t.Fatalf("an abandoned recording failed the join: %v", err)
	}
	if snap != nil {
		t.Errorf("a snapshot was kept from a configuration phase of %d packets", len(script))
	}
}

// TestRecordJoinGivesUpOnAnOversizedRegistrySet is the same rule measured in
// bytes rather than packets, which is the one that matters for a backend whose
// registries are enormous rather than numerous.
func TestRecordJoinGivesUpOnAnOversizedRegistrySet(t *testing.T) {
	t.Parallel()

	rig := newCaptureRig(t)

	// Three of these are over the limit; each one on its own is within what the
	// codec will carry in a single frame.
	huge := string(bytes.Repeat([]byte("r"), maxCaptureBytes/3+1))
	script := []*protocol.Packet{
		capturePacket(idRegistryData, huge),
		capturePacket(idRegistryData, huge),
		capturePacket(idRegistryData, huge),
		capturePacket(idFinishConfiguration, ""),
		capturePacket(capturePlayLogin, "login"),
	}
	rig.fromBackend(script...)

	for _, want := range script {
		got := rig.expectPlayer(want.ID)
		if !bytes.Equal(got.Data, want.Data) {
			t.Errorf("the player received %d bytes of 0x%02x, wanted %d",
				len(got.Data), got.ID, len(want.Data))
		}
	}

	snap, err := rig.finish()
	if err != nil {
		t.Fatalf("an abandoned recording failed the join: %v", err)
	}
	if snap != nil {
		t.Error("a snapshot was kept from a registry set past the size limit")
	}
}

// TestRecordJoinEmptiesTheClientsKnownPacksReply pins the one packet the proxy
// rewrites. Everything else the client says during configuration reaches the
// backend exactly as it was sent.
func TestRecordJoinEmptiesTheClientsKnownPacksReply(t *testing.T) {
	t.Parallel()

	rig := newCaptureRig(t)

	information := protocol.NewWriter(0x00).String("en_us").Packet()
	reply := protocol.NewWriter(idKnownPacksReply).
		VarInt(1).
		String("minecraft").
		String("core").
		String("1.21.8").
		Packet()

	rig.fromPlayer(
		protocol.NewWriter(idLoginAcknowledged).Packet(),
		information,
		reply,
		protocol.NewWriter(idAckFinishConfiguration).Packet(),
	)

	if got := rig.expectBackend(idLoginAcknowledged); len(got.Data) != 0 {
		t.Errorf("login acknowledged reached the backend carrying %q", got.Data)
	}
	if got := rig.expectBackend(0x00); !bytes.Equal(got.Data, information.Data) {
		t.Errorf("client information reached the backend as %q, wanted %q", got.Data, information.Data)
	}

	packs := rig.expectBackend(idKnownPacksReply)
	if !bytes.Equal(packs.Data, []byte{0x00}) {
		t.Errorf("known packs reached the backend as %q, wanted an empty list", packs.Data)
	}
	if bytes.Contains(packs.Data, []byte("minecraft")) {
		t.Error("the client's own known packs reached the backend, so it may omit registry NBT")
	}

	rig.expectBackend(idAckFinishConfiguration)

	if _, err := rig.finish(); err != nil {
		t.Fatalf("recordJoin: %v", err)
	}
}

// TestRecordJoinHandsTheClientStreamOverWithoutLosingBytes is the backend
// direction's handover test applied to the other direction, which has the same
// risk: the rewriter reads ahead, and anything it has buffered when it stops
// has to come out of the copy that takes over.
func TestRecordJoinHandsTheClientStreamOverWithoutLosingBytes(t *testing.T) {
	t.Parallel()

	rig := newCaptureRig(t)

	brand := protocol.NewWriter(0x02).String("vanilla").Packet()
	rig.fromPlayer(
		protocol.NewWriter(idLoginAcknowledged).Packet(),
		brand,
		protocol.NewWriter(idAckFinishConfiguration).Packet(),
	)

	rig.expectBackend(idLoginAcknowledged)
	if got := rig.expectBackend(0x02); !bytes.Equal(got.Data, brand.Data) {
		t.Errorf("the plugin message reached the backend as %q, wanted %q", got.Data, brand.Data)
	}
	rig.expectBackend(idAckFinishConfiguration)

	moving := []byte("everything the player does from here on")
	rig.rawFromPlayer(moving)
	rig.expectRaw("backend", rig.backend, moving)

	if _, err := rig.finish(); err != nil {
		t.Fatalf("recordJoin: %v", err)
	}
}

// TestRecordJoinKeepsNothingThatWouldDisconnectAReplayedClient covers the two
// recordings that look healthy and are not: one that describes no world, and one
// carrying a packet too large to send back.
//
// Both matter more than they look. A stored recording stops the next join being
// watched for a day, so a bad one does not merely fail — it takes the version
// out of service and keeps it out.
func TestRecordJoinKeepsNothingThatWouldDisconnectAReplayedClient(t *testing.T) {
	t.Parallel()

	t.Run("a configuration phase with no registry data at all", func(t *testing.T) {
		t.Parallel()

		rig := newCaptureRig(t)
		rig.completeClientConfiguration()

		// Only packets that are forwarded but never recorded, then the end of
		// the phase: nothing describing a world went past.
		script := []*protocol.Packet{
			capturePacket(0x01, "minecraft:brand"),
			capturePacket(idFinishConfiguration, ""),
			capturePacket(capturePlayLogin, "the world the player is entering"),
		}
		rig.fromBackend(script...)
		for _, want := range script {
			rig.expectPlayer(want.ID)
		}

		snap, err := rig.finish()
		if err != nil {
			t.Fatalf("recordJoin: %v", err)
		}
		if snap != nil {
			t.Fatalf("kept a recording of %d packets that describes no world", len(snap.Config))
		}
	})
}

// TestReplayableRejectsWhatTheWaitingWorldCouldNotSendBack guards the size gap
// between the two links.
//
// A backend connection usually has compression on, and a compressed frame well
// under the protocol's frame limit can decompress to several times it — the
// codec allows up to eight megabytes. The waiting world's connection has
// compression off, so anything over the frame limit is refused when it is
// replayed, and refused *after* Login Success has gone out, with no way left to
// put the player anywhere else. It has to be caught while recording.
//
// This is a unit test rather than an end-to-end one because such a packet cannot
// be staged through an uncompressed connection at all: the writer refuses it,
// which is the very behaviour being guarded against.
func TestReplayableRejectsWhatTheWaitingWorldCouldNotSendBack(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		size int
		want bool
	}{
		{"an ordinary registry packet", 64 * 1024, true},
		{"empty", 0, true},
		{"just inside the frame limit", protocol.MaxPacketLength - 16, true},
		{"past the frame limit", protocol.MaxPacketLength, false},
		{"what a compressed backend link can legitimately deliver", 4 * 1024 * 1024, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			pkt := &protocol.Packet{ID: idRegistryData, Data: make([]byte, tc.size)}
			if got := replayable(pkt); got != tc.want {
				t.Errorf("replayable(%d bytes) = %v, want %v", tc.size, got, tc.want)
			}
		})
	}
}
