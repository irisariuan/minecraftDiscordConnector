package route

import (
	"fmt"
	"io"
	"sync"
	"sync/atomic"
	"time"

	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/control"
	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/limbo"
	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/protocol"
)

// Recording the waiting world from a join that is going to succeed anyway.
//
// The doc comment on [limbo.Snapshot] explains why the registry set is recorded
// rather than authored. This file is the recording half, and being in the
// middle of somebody's join shapes all of it:
//
//   - A recording must never cost the player their join. Every way this can go
//     wrong except a dead connection ends the recording and nothing else; the
//     session falls through to the same byte copy it would have had anyway.
//   - The proxy is not only listening, it is also the one relaying the client's
//     answers, and it uses that once — to empty the client's Known Packs reply,
//     see [Proxy.rewriteKnownPacks] — because without that there is very little
//     worth recording.
//
// The two directions are handled by separate goroutines that share nothing:
// each reads one connection and writes the other, which is exactly the split
// [protocol.Conn] supports, so neither needs to know where the other has got to.

// Clientbound packet ids in the configuration phase, as they have stood since
// Cookie Request was added at 0x00 in 1.20.5 and shifted the rest along. A
// snapshot is only ever replayed to a client of the version it was taken from,
// but these ids decide what is recorded in the first place, so a caller that
// records from an older join would be writing down the wrong packets.
const (
	idFinishConfiguration   = 0x03
	idRegistryData          = 0x07
	idUpdateEnabledFeatures = 0x0C
	idUpdateTags            = 0x0D
)

// Serverbound configuration ids the client direction has to recognise.
const (
	idKnownPacksReply        = 0x07
	idAckFinishConfiguration = 0x03
)

// captureBudget bounds how long the backend's configuration phase may take
// before the recording is abandoned.
//
// A healthy backend gets through configuration in well under a second, and even
// one that has just started and is still loading gets nowhere near this. Thirty
// seconds is therefore not a limit on anything real; it exists so that a
// backend which streams configuration packets forever, or opens a frame and
// stops, cannot pin a player's join in packet mode indefinitely.
const captureBudget = 30 * time.Second

// maxCaptureConfigPackets bounds how many configuration packets are relayed in
// packet mode before the recording is abandoned.
//
// Vanilla sends one Registry Data packet per registry — around forty in 1.21 —
// plus tags, feature flags and a handful of housekeeping packets. A modded
// backend with its own registries sends more. 256 leaves generous room for that
// and still bounds a backend that never stops talking.
const maxCaptureConfigPackets = 256

// maxCaptureBytes bounds the recorded payload, in bytes, before the recording
// is abandoned.
//
// Because the recording join empties the client's Known Packs reply, the
// backend spells out the full NBT for every registry entry, so what arrives
// here is far larger than an untouched vanilla join: a hundred kilobytes and up
// rather than a few. 4 MiB is roughly an order of magnitude above even a
// heavily modded registry set, and the point of it is only to stop one
// misbehaving backend from making the proxy hold megabytes per joining player.
const maxCaptureBytes = 4 * 1024 * 1024

// maxClientConfigPackets bounds the client direction the same way.
//
// There is deliberately no time bound on that direction: a client working
// through a resource pack the backend pushed can legitimately sit in
// configuration for minutes while saying almost nothing, and cutting it short
// on the clock would be cutting short a join that is going fine. What is worth
// bounding is a client that talks without end, and a real one sends well under
// a dozen packets here.
const maxClientConfigPackets = 128

// recordJoin relays the backend's post-login stream to the client in packet
// mode for just long enough to record a [limbo.Snapshot], then hands both
// directions over to a raw byte copy for the rest of the session.
//
// It is called with the connection just past Login Success, which is to say the
// backend is in the configuration phase and the client is about to acknowledge
// the login. It returns when the session ends, as [Proxy.tunnel] does.
//
// A nil snapshot with a nil error means the recording was abandoned and the
// player's session carried on regardless, which is the intended outcome of
// anything unexpected. An error means the session itself is over.
func (p *Proxy) recordJoin(
	client, backend *protocol.Conn,
	protocolVersion int32,
	entry control.ServerEntry,
) (*limbo.Snapshot, error) {
	// The teardown below is [Proxy.tunnel]'s, repeated because this function
	// cannot call it: the copy in one direction has to start late, after the
	// packets in front of it have been read. Both should be folded into tunnel
	// once it can be given a starting point other than "from the first byte".
	_ = client.SetReadDeadline(time.Time{})
	_ = client.SetWriteDeadline(time.Time{})

	var once sync.Once
	closeBoth := func() {
		once.Do(func() {
			_ = client.Close()
			_ = backend.Close()
		})
	}

	// Whether the client's side of the configuration phase was relayed all the
	// way through. The goroutine below sets it before forwarding the
	// acknowledgement, and the backend cannot send the packet that ends the
	// capture until it has that acknowledgement, so by the time the capture
	// returns this is settled.
	var relayed atomic.Bool

	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		defer closeBoth()
		p.relayClientConfiguration(client, backend, &relayed)
	}()

	snap, err := p.captureConfiguration(client, backend, protocolVersion, entry)
	if snap != nil && !relayed.Load() {
		// The other direction did not see the configuration phase out, so the
		// client's known-packs reply may have reached the backend intact, and
		// the registry data just recorded may be missing the NBT that reply let
		// the backend omit. Such a recording looks perfectly healthy and
		// disconnects whoever it is replayed to, so it is thrown away.
		p.log.Debug("discarding a recording whose known-packs reply was not confirmed emptied",
			"server", entry.Tag, "protocol", protocolVersion)
		snap = nil
	}

	// Kept here rather than by the caller, because the caller does not get this
	// function back until the copy below has run its course — which is when the
	// player leaves, an hour or a day from now. A recording is finished seconds
	// into the session and is useful to everybody arriving in the meantime, so
	// it is put away the moment it exists.
	p.keepSnapshot(snap, entry)

	if err == nil {
		_, _ = io.Copy(client.StreamWriter(), backend.StreamReader())
	}
	closeBoth()
	wg.Wait()
	return snap, err
}

// captureConfiguration reads the backend's configuration phase packet by
// packet, forwarding every one of them to the client and keeping a copy of the
// ones that describe the world.
//
// The only error it reports is a failed write to the client, which means the
// player's connection is gone. Everything else — a backend that stops talking,
// or talks far past any plausible configuration phase — abandons the recording
// and leaves the session to the copy that follows.
func (p *Proxy) captureConfiguration(
	client, backend *protocol.Conn,
	protocolVersion int32,
	entry control.ServerEntry,
) (*limbo.Snapshot, error) {
	snap := &limbo.Snapshot{
		Protocol:   protocolVersion,
		Source:     entry.Tag,
		RecordedAt: time.Now(),
	}

	deadline := time.Now().Add(captureBudget)
	_ = backend.SetReadDeadline(deadline)

	abandon := func(reason string) (*limbo.Snapshot, error) {
		p.log.Debug("gave up recording a snapshot",
			"server", entry.Tag, "protocol", protocolVersion, "reason", reason)
		return nil, nil
	}
	// resume undoes the read deadline for the byte copy that follows, and must
	// be called on every path that leaves this function with the session still
	// alive. Forgetting it leaves the copy running against a deadline meant for
	// the configuration phase, which would end a perfectly healthy session
	// partway through the player's evening.
	//
	// The one place it is deliberately skipped is a failed read. ReadPacket may
	// have consumed part of a frame before failing, and a copy that picked up
	// mid-frame would hand the client a truncated packet; letting the deadline
	// stand ends the copy at once instead, which is the honest outcome for a
	// backend that stopped talking. Today ReadPacket happens to consume whole
	// frames or nothing, so the stream would in fact still be aligned — but
	// that is an implementation detail of the codec, not a promise, and this
	// does not want to depend on it.
	resume := func() { _ = backend.SetReadDeadline(time.Time{}) }

	var recorded int
	for seen := 0; ; seen++ {
		if seen >= maxCaptureConfigPackets {
			resume()
			return abandon("the configuration phase ran past its packet limit")
		}
		if !time.Now().Before(deadline) {
			resume()
			return abandon("the configuration phase ran past its time limit")
		}

		pkt, err := backend.ReadPacket()
		if err != nil {
			return abandon(fmt.Sprintf("reading from the backend: %v", err))
		}
		if err := client.WritePacket(pkt); err != nil {
			return nil, fmt.Errorf("relay configuration packet 0x%02x: %w", pkt.ID, err)
		}

		if pkt.ID == idFinishConfiguration {
			// Nothing else arrives on this connection until the client
			// acknowledges, and the first thing the backend sends once it does
			// is Login (play). So the end of the configuration phase is legible
			// from this side alone, and the client's acknowledgement — which
			// travels the other way, through another goroutine — never has to
			// be observed here.
			break
		}
		if !recordableConfigPacket(pkt.ID) {
			continue
		}
		if !replayable(pkt) {
			// A packet the recording could hold but the waiting world could not
			// send back. The client link runs uncompressed, so a frame over the
			// protocol's own limit would be refused on replay — after Login
			// Success has gone out, with no way left to fall back. Better to
			// have no recording for this version than one that disconnects
			// everybody it is replayed to.
			resume()
			return abandon(fmt.Sprintf(
				"a configuration packet of %d bytes is too large to replay", len(pkt.Data)))
		}
		recorded += len(pkt.Data)
		if recorded > maxCaptureBytes {
			resume()
			return abandon("the registry set ran past its size limit")
		}
		snap.Config = append(snap.Config, clonePacket(pkt))
	}

	login, err := backend.ReadPacket()
	if err != nil {
		return abandon(fmt.Sprintf("waiting for login (play): %v", err))
	}
	if err := client.WritePacket(login); err != nil {
		return nil, fmt.Errorf("relay login (play): %w", err)
	}
	// Both checks below are reached with the login packet already forwarded
	// whole, so the session is healthy and the copy must be let out of the
	// configuration-phase deadline even though the recording is being thrown
	// away.
	if !replayable(login) {
		resume()
		return abandon(fmt.Sprintf(
			"the login (play) packet is %d bytes, too large to replay", len(login.Data)))
	}
	if len(snap.Config) == 0 {
		resume()
		// A configuration phase that described no world at all. Replaying it
		// would take a client into the play phase with none of the registries
		// it insists on, which is the exact failure the recording exists to
		// avoid — and storing it would make that failure stick for a day,
		// because a stored recording stops the next join being watched.
		return abandon("the backend sent no registry data at all")
	}
	snap.LoginPlay = clonePacket(login)
	resume()

	p.log.Debug("recorded a snapshot",
		"server", entry.Tag, "protocol", protocolVersion,
		"packets", len(snap.Config), "bytes", recorded)
	return snap, nil
}

// keepSnapshot files a finished recording, if there is one and there is
// anywhere to put it. Failing to store it costs nothing permanent: the next
// join at this version is watched again.
func (p *Proxy) keepSnapshot(snap *limbo.Snapshot, entry control.ServerEntry) {
	if snap == nil || p.opts.Snapshots == nil {
		return
	}
	if err := p.opts.Snapshots.Put(snap); err != nil {
		p.log.Warn("could not keep the recorded world",
			"protocol", snap.Protocol, "server", entry.Tag, "error", err)
		return
	}
	p.log.Info("recorded a waiting world",
		"protocol", snap.Protocol, "server", entry.Tag, "packets", len(snap.Config))
}

// recordableConfigPacket reports whether a configuration packet describes the
// world rather than this particular connection.
//
// The whitelist is the point of this function, and it is deliberately a
// whitelist rather than a list of exclusions. Everything a backend sends here
// is forwarded to the real client, but only these three are ever said again to
// a different one, and most of the rest would be actively wrong replayed: a
// cookie belongs to one session, a resource pack push expects an answer nobody
// will send, a transfer would throw a waiting player somewhere they never asked
// to go. An id this proxy has not heard of gets the same treatment as those,
// because an unknown packet is far more likely to be another piece of
// connection state than another registry.
// replayable reports whether a recorded packet could be sent back to a client
// later. The waiting world never turns compression on, so the protocol's frame
// limit is the whole of the budget.
func replayable(pkt *protocol.Packet) bool {
	return len(pkt.Data) <= protocol.MaxPacketLength-protocol.MaxVarIntLen
}

func recordableConfigPacket(id int32) bool {
	switch id {
	case idRegistryData, idUpdateTags, idUpdateEnabledFeatures:
		return true
	default:
		return false
	}
}

// clonePacket copies a packet out of the connection's reading machinery.
//
// A [protocol.Packet]'s payload aliases the buffer it was decoded from, and a
// snapshot outlives the connection that produced it by design — it is replayed
// to players who arrive hours later. Keeping the alias would make a recording
// depend on the reader never reusing that buffer, which is not a property a
// snapshot should be resting on.
func clonePacket(pkt *protocol.Packet) protocol.Packet {
	return protocol.Packet{
		ID:   pkt.ID,
		Data: append([]byte(nil), pkt.Data...),
	}
}

// relayClientConfiguration relays the client's side of the configuration phase
// packet by packet so that the Known Packs reply can be replaced, then hands
// the rest of the direction to a raw copy.
//
// It sets completed when it sees the configuration phase through to the client's
// acknowledgement, which is the caller's only evidence that the reply really was
// emptied — and therefore that what was recorded in the other direction is
// complete rather than full of holes. It cannot fail a join on its own: if it
// stops early the session continues as an opaque copy, and if the connection is
// dead the copy ends and the caller's teardown closes both sides.
func (p *Proxy) relayClientConfiguration(client, backend *protocol.Conn, completed *atomic.Bool) {
	aligned := p.rewriteKnownPacks(client, backend, completed)
	if aligned {
		_, _ = io.Copy(backend.StreamWriter(), client.StreamReader())
	}
}

// rewriteKnownPacks forwards the client's configuration packets to the backend,
// replacing its Known Packs reply with an empty list.
//
// It reports whether the stream is still on a frame boundary, and so whether the
// remainder can be copied byte for byte, and separately sets completed if the
// configuration phase was seen all the way through to the client's
// acknowledgement. Only then is it certain that no un-emptied reply reached the
// backend, and only then is the recording in the other direction worth keeping.
//
// # Why the reply is replaced
//
// A vanilla backend negotiates known packs before it sends the registry set: it
// advertises minecraft:core at its own game version, the client answers with
// the packs it has locally too, and for every one they agree on the backend
// then sends Registry Data with the NBT omitted, leaving the client to fill the
// entries in from its own copy.
//
// Recorded, that is a snapshot full of holes, replayable only to a client whose
// local data happens to match. Nothing here can promise that: known packs are
// named by game version while snapshots are keyed by protocol version, and one
// protocol number covers several game versions — 772 is both 1.21.7 and 1.21.8.
// A 1.21.8 client replaying a recording made from a 1.21.7 join would fail to
// bind those entries and be disconnected at the end of configuration, which is
// the precise failure the whole snapshot design exists to avoid.
//
// Answering "I have nothing" leaves the backend able to assume nothing, so it
// spells out every entry in full. That is the only form of the data that stands
// on its own once the connection it came from is gone.
func (p *Proxy) rewriteKnownPacks(client, backend *protocol.Conn, completed *atomic.Bool) (aligned bool) {
	for seen := 0; seen < maxClientConfigPackets; seen++ {
		pkt, err := client.ReadPacket()
		if err != nil {
			// Either the player left or the frame is half-read; in both cases
			// there is nothing safe or useful left to copy.
			p.log.Debug("stopped rewriting the client's configuration", "error", err)
			return false
		}

		// The first packet is Login Acknowledged, which is still a login-phase
		// packet and shares its id with Acknowledge Finish Configuration. It is
		// forwarded before the configuration ids are consulted so that the two
		// cannot be confused.
		if seen > 0 && pkt.ID == idKnownPacksReply {
			empty := protocol.NewWriter(idKnownPacksReply).VarInt(0).Packet()
			if err := backend.WritePacket(empty); err != nil {
				return false
			}
			p.log.Debug("emptied the client's known packs reply so the backend sends full registry data")
			continue
		}

		if seen > 0 && pkt.ID == idAckFinishConfiguration {
			// Recorded before the acknowledgement is forwarded, not after.
			//
			// Forwarding it is what lets the backend move to the play phase and
			// send the packet that ends the recording in the other direction,
			// and that direction reads this flag the moment it does. Setting it
			// afterwards leaves a window in which a sound recording is thrown
			// away for want of a confirmation that had already been earned.
			//
			// Claiming it before the write succeeds is safe: a backend that
			// never receives the acknowledgement never leaves the configuration
			// phase, so the recording never completes and nothing is stored.
			completed.Store(true)
		}
		if err := backend.WritePacket(pkt); err != nil {
			return false
		}
		if seen > 0 && pkt.ID == idAckFinishConfiguration {
			// The client is entering the play phase and sends nothing else this
			// proxy has any reason to rewrite.
			return true
		}
	}
	// A client this talkative during configuration is not one whose packets are
	// worth reading one at a time, but it is still a player joining a server
	// that is up, so the session continues as a copy. What cannot continue is
	// the recording: a reply may have slipped past unread.
	p.log.Debug("stopped rewriting the client's configuration", "reason", "packet limit")
	return true
}
