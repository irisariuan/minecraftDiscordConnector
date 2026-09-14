package route

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"strconv"
	"sync"
	"time"

	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/control"
	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/forward"
	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/limbo"
	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/protocol"
)

// Fetching a waiting world, rather than waiting for a player to bring one past.
//
// A world can be learned from any join, but joins only happen when a server is
// up, and the whole point of the waiting world is what happens when none is. A
// proxy that had never seen a join would therefore have nothing to show the
// first player to arrive — and since arriving no longer starts anything, that
// player would have no way to fix it either. So the proxy goes and gets one.
//
// It connects to a running backend as an ordinary player would, walks the
// configuration phase, writes down the registry set and hangs up. The hanging up
// is the important part: a backend puts a player into the world at the moment it
// sends Login (play), so stopping before that means no join message, no entry in
// the player list, and nothing for the connector plugin to report. Nobody sees
// this happen.
//
// What it costs is the Login (play) packet, which has to be composed rather than
// copied — see internal/limbo/synth.go. Such a world is marked as composed, and
// the first real join at that version replaces it.

const (
	// harvestInterval is how often the proxy looks for a world it is missing.
	// Nothing about this is urgent: it matters within a minute of a server
	// first coming up, and never again.
	harvestInterval = 45 * time.Second
	// harvestRetry is how long to leave a backend alone after a failed attempt.
	// The usual reason for failure is a backend that refuses strangers, which
	// will still be true in a minute.
	harvestRetry = 15 * time.Minute
	// harvestTimeout bounds one attempt end to end.
	harvestTimeout = 30 * time.Second
	// probeName is the player the proxy logs in as. It never reaches a world,
	// but it does reach a server log, so it says what it is.
	probeName = "ProxyWorldProbe"
)

// harvester remembers which backends have already been asked, so a server that
// refuses the probe is not asked again every minute.
type harvester struct {
	mu        sync.Mutex
	attempted map[int]time.Time
}

func newHarvester() *harvester {
	return &harvester{attempted: make(map[int]time.Time)}
}

func (h *harvester) worthTrying(serverID int) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	last, seen := h.attempted[serverID]
	if seen && time.Since(last) < harvestRetry {
		return false
	}
	h.attempted[serverID] = time.Now()
	return true
}

// harvestWorlds looks for waiting worlds the proxy does not have, for as long as
// the proxy is running.
func (p *Proxy) harvestWorlds(ctx context.Context) {
	if p.opts.Snapshots == nil {
		return
	}
	h := newHarvester()

	ticker := time.NewTicker(harvestInterval)
	defer ticker.Stop()
	for {
		p.harvestRound(ctx, h)
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

// harvestRound tries each running backend the proxy has not recently asked.
func (p *Proxy) harvestRound(ctx context.Context, h *harvester) {
	cfg := p.opts.Poller.Snapshot()
	if cfg == nil {
		return
	}
	for _, entry := range cfg.Servers {
		if ctx.Err() != nil {
			return
		}
		if !entry.Online || !h.worthTrying(entry.ID) {
			continue
		}
		p.harvestFrom(ctx, entry)
	}
}

// harvestFrom learns what version a backend speaks and, if that version has no
// waiting world yet, fetches one from it.
func (p *Proxy) harvestFrom(ctx context.Context, entry control.ServerEntry) {
	ctx, cancel := context.WithTimeout(ctx, harvestTimeout)
	defer cancel()

	// Asked rather than guessed. A backend speaks one protocol version, and
	// trying every version the proxy supports against it would mean a handful
	// of refused logins in its console for every one that worked.
	protocolVersion, err := p.backendProtocol(ctx, entry)
	if err != nil {
		p.log.Debug("could not ask a backend what version it speaks",
			"server", entry.Tag, "error", err)
		return
	}
	if !limbo.Supports(protocolVersion) {
		p.log.Debug("no waiting world can be built for this backend's version",
			"server", entry.Tag, "protocol", protocolVersion)
		return
	}
	if snap, ok := p.opts.Snapshots.Get(protocolVersion); ok && !snap.Synthesized {
		return
	}

	snap, err := p.fetchWorld(ctx, entry, protocolVersion)
	if err != nil {
		p.log.Debug("could not fetch a waiting world",
			"server", entry.Tag, "protocol", protocolVersion, "error", err)
		return
	}
	if err := p.opts.Snapshots.Put(snap); err != nil {
		p.log.Warn("could not keep a fetched waiting world",
			"server", entry.Tag, "protocol", protocolVersion, "error", err)
		return
	}
	p.log.Info("fetched a waiting world",
		"server", entry.Tag, "protocol", protocolVersion, "packets", len(snap.Config))
}

// backendProtocol asks a backend for its server-list entry, which names the
// protocol version it speaks. This is the same request a client makes before it
// ever tries to join, so it is the quietest question available.
func (p *Proxy) backendProtocol(ctx context.Context, entry control.ServerEntry) (int32, error) {
	conn, err := p.dialBackend(ctx, entry)
	if err != nil {
		return 0, err
	}
	defer conn.Close()

	hs := protocol.NewWriter(0x00).
		VarInt(mcverAny).
		String(entry.Host).
		UShort(uint16(entry.Port)).
		VarInt(stateStatus).
		Packet()
	if err := conn.WritePacket(hs); err != nil {
		return 0, err
	}
	if err := conn.WritePacket(protocol.NewWriter(0x00).Packet()); err != nil {
		return 0, err
	}

	pkt, err := conn.ReadPacket()
	if err != nil {
		return 0, fmt.Errorf("reading the status response: %w", err)
	}
	body, err := protocol.NewReader(pkt.Data).String(1 << 20)
	if err != nil {
		return 0, fmt.Errorf("reading the status body: %w", err)
	}
	var status struct {
		Version struct {
			Protocol int32 `json:"protocol"`
		} `json:"version"`
	}
	if err := json.Unmarshal([]byte(body), &status); err != nil {
		return 0, fmt.Errorf("parsing the status body: %w", err)
	}
	if status.Version.Protocol <= 0 {
		return 0, fmt.Errorf("the backend reported protocol %d", status.Version.Protocol)
	}
	return status.Version.Protocol, nil
}

// mcverAny is the protocol version used when asking for a server-list entry.
// Servers answer a status request whatever version it claims, and echo the
// number back, so this one is arbitrary and never compared against anything.
const mcverAny = 0

// fetchWorld logs in to a backend, records its configuration phase and leaves
// before it would be put into the world.
func (p *Proxy) fetchWorld(
	ctx context.Context,
	entry control.ServerEntry,
	protocolVersion int32,
) (*limbo.Snapshot, error) {
	mode, err := forward.ParseMode(entry.Forwarding)
	if err != nil {
		return nil, err
	}

	id := protocol.OfflineUUID(probeName)
	identity := forward.Identity{UUID: id, Name: probeName, ClientIP: "127.0.0.1"}

	conn, err := p.dialBackend(ctx, entry)
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	host := entry.Host
	if mode == forward.ModeBungeeCord {
		if host, err = forward.BungeeAddress(host, identity); err != nil {
			return nil, err
		}
	}
	hs := protocol.NewWriter(0x00).
		VarInt(protocolVersion).
		String(host).
		UShort(uint16(entry.Port)).
		VarInt(stateLogin).
		Packet()
	if err := conn.WritePacket(hs); err != nil {
		return nil, err
	}
	if err := writeLoginStart(conn, protocolVersion, probeName, id); err != nil {
		return nil, err
	}
	if err := p.probeLogin(conn, mode, entry, identity); err != nil {
		return nil, err
	}

	snap := &limbo.Snapshot{
		Protocol:    protocolVersion,
		Source:      entry.Tag,
		RecordedAt:  time.Now(),
		Synthesized: true,
	}
	if err := p.probeConfiguration(conn, snap); err != nil {
		return nil, err
	}
	if len(snap.Config) == 0 {
		return nil, fmt.Errorf("the backend sent no registry data")
	}

	dimension, err := limbo.DimensionFrom(snap.Config)
	if err != nil {
		return nil, err
	}
	login, err := limbo.BuildLoginPlay(protocolVersion, dimension)
	if err != nil {
		return nil, err
	}
	snap.LoginPlay = *login
	return snap, nil
}

// dialBackend opens a framed connection to a backend.
func (p *Proxy) dialBackend(ctx context.Context, entry control.ServerEntry) (*protocol.Conn, error) {
	addr := net.JoinHostPort(entry.Host, strconv.Itoa(entry.Port))
	dialer := net.Dialer{Timeout: backendDialTimeout}
	raw, err := dialer.DialContext(ctx, "tcp", addr)
	if err != nil {
		return nil, fmt.Errorf("dial backend %s: %w", addr, err)
	}
	if deadline, ok := ctx.Deadline(); ok {
		_ = raw.SetDeadline(deadline)
	}
	return protocol.NewConn(raw), nil
}

// probeLogin completes the login phase as the probe, answering whatever the
// backend asks for on the way.
func (p *Proxy) probeLogin(
	conn *protocol.Conn,
	mode forward.Mode,
	entry control.ServerEntry,
	identity forward.Identity,
) error {
	for {
		pkt, err := conn.ReadPacket()
		if err != nil {
			return fmt.Errorf("reading the backend's login: %w", err)
		}
		switch pkt.ID {
		case idSetCompression:
			threshold, err := protocol.NewReader(pkt.Data).VarInt()
			if err != nil {
				return err
			}
			conn.EnableCompression(int(threshold))

		case idLoginPluginRequest:
			if err := p.answerLoginPlugin(conn, pkt, mode, entry, identity); err != nil {
				return err
			}

		case idLoginSuccess:
			// Acknowledging moves the backend into the configuration phase,
			// which is the only phase this connection is here for.
			return conn.WritePacket(protocol.NewWriter(idLoginAcknowledged).Packet())

		case idLoginDisconnect:
			return fmt.Errorf("the backend refused the probe: %s", disconnectReason(pkt))

		case idEncryptionRequest:
			return fmt.Errorf("backend %q is in online mode", entry.Tag)

		default:
			return fmt.Errorf("unexpected packet 0x%02x during the probe's login", pkt.ID)
		}
	}
}

// Configuration-phase packet ids used by the probe. The clientbound ones are
// read, the serverbound ones answered.
const (
	cbConfigCookieRequest = 0x00
	cbConfigDisconnect    = 0x02
	cbConfigKeepAlive     = 0x04
	cbKnownPacks          = 0x0E

	sbConfigCookieResponse = 0x01
	sbConfigKeepAlive      = 0x04
)

// probeConfiguration records the backend's configuration phase, stopping the
// moment it ends.
//
// It never acknowledges the end. Acknowledging is what asks the backend to put
// this player in the world, and the point of the probe is to learn what a world
// looks like without anybody appearing in one.
func (p *Proxy) probeConfiguration(conn *protocol.Conn, snap *limbo.Snapshot) error {
	for i := 0; i < maxCaptureConfigPackets; i++ {
		pkt, err := conn.ReadPacket()
		if err != nil {
			return fmt.Errorf("reading the backend's configuration: %w", err)
		}

		switch pkt.ID {
		case idFinishConfiguration:
			return nil

		case cbConfigDisconnect:
			return fmt.Errorf("the backend ended the probe's configuration")

		case cbKnownPacks:
			// The same answer a recording join gives on the player's behalf:
			// claiming to know nothing makes the backend spell out every
			// registry entry, which is the only form of the data that can be
			// replayed to a client whose local copy is unknown.
			empty := protocol.NewWriter(idKnownPacksReply).VarInt(0).Packet()
			if err := conn.WritePacket(empty); err != nil {
				return err
			}

		case cbConfigKeepAlive:
			if err := conn.WritePacket(protocol.NewWriter(sbConfigKeepAlive).Raw(pkt.Data).Packet()); err != nil {
				return err
			}

		case cbConfigCookieRequest:
			key, err := protocol.NewReader(pkt.Data).String(32767)
			if err != nil {
				return err
			}
			reply := protocol.NewWriter(sbConfigCookieResponse).String(key).Bool(false).Packet()
			if err := conn.WritePacket(reply); err != nil {
				return err
			}

		default:
			if recordableConfigPacket(pkt.ID) && replayable(pkt) {
				snap.Config = append(snap.Config, clonePacket(pkt))
			}
		}
	}
	return fmt.Errorf("the backend's configuration phase ran past its packet limit")
}

// disconnectReason pulls whatever text a login disconnect carried, for the log.
func disconnectReason(pkt *protocol.Packet) string {
	reason, err := protocol.NewReader(pkt.Data).String(262144)
	if err != nil {
		return "(unreadable)"
	}
	return reason
}
