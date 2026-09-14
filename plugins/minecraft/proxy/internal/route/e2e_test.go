package route

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/auth"
	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/control"
	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/limbo"
	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/nbt"
	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/protocol"
)

// These tests drive the proxy the way a real client and a real backend would:
// a socket on each side, a real encryption exchange, and a stand-in session
// server. They are the only place the login state machine, the hold and the
// tunnel are exercised together.

const e2eProtocol = 767

var e2ePlayerUUID = "069a79f4-44e9-4726-a5be-fca90e38aaf5"

// ─── Stand-in bot ─────────────────────────────────────────────────────────────

// e2eBot is a fake control API whose backend can be switched online mid-test.
type e2eBot struct {
	mu           sync.Mutex
	online       bool
	backendPort  int
	linked       bool
	startCalls   atomic.Int32
	sessionCalls atomic.Int32
	// sessions carries the raw body of each POST /session, so a test can
	// assert on the identity the proxy claimed.
	sessions chan map[string]any
	server   *httptest.Server
}

func newE2EBot(t *testing.T, backendPort int, online, linked bool) *e2eBot {
	t.Helper()
	bot := &e2eBot{
		online:      online,
		backendPort: backendPort,
		linked:      linked,
		sessions:    make(chan map[string]any, 4),
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/config", func(w http.ResponseWriter, r *http.Request) {
		bot.mu.Lock()
		cfg := control.Config{
			ListenPort: 25565,
			MaxPlayers: 20,
			MOTD:       "test",
			Servers: []control.ServerEntry{{
				ID: 1, Tag: "Survival", Host: "127.0.0.1",
				Port: bot.backendPort, Online: bot.online, Forwarding: "bungeecord",
			}},
		}
		bot.mu.Unlock()
		writeJSON(w, cfg)
	})
	mux.HandleFunc("/session", func(w http.ResponseWriter, r *http.Request) {
		bot.sessionCalls.Add(1)
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err == nil {
			select {
			case bot.sessions <- body:
			default:
			}
		}
		bot.mu.Lock()
		sess := control.Session{
			Linked:    bot.linked,
			DiscordID: "42",
			Servers: []control.SessionServerInfo{{
				ID: 1, Tag: "Survival", Online: bot.online, Accessible: true, CanStart: true,
			}},
		}
		bot.mu.Unlock()
		writeJSON(w, sess)
	})
	mux.HandleFunc("/start", func(w http.ResponseWriter, r *http.Request) {
		bot.startCalls.Add(1)
		writeJSON(w, control.StartResult{Status: control.StatusStarted, Message: "starting"})
	})
	bot.server = httptest.NewServer(mux)
	t.Cleanup(bot.server.Close)
	return bot
}

func (b *e2eBot) setOnline(v bool) {
	b.mu.Lock()
	b.online = v
	b.mu.Unlock()
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

// ─── Stand-in Mojang ──────────────────────────────────────────────────────────

// newE2ESession returns a stand-in session server that verifies any player,
// recording the server hash it was asked about.
func newE2ESession(t *testing.T, hashes chan<- string) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case hashes <- r.URL.Query().Get("serverId"):
		default:
		}
		writeJSON(w, map[string]any{
			"id":   strings.ReplaceAll(e2ePlayerUUID, "-", ""),
			"name": r.URL.Query().Get("username"),
			"properties": []map[string]string{
				{"name": "textures", "value": "dGV4dHVyZQ==", "signature": "c2ln"},
			},
		})
	}))
	t.Cleanup(srv.Close)
	return srv
}

// ─── Stand-in backend ─────────────────────────────────────────────────────────

// e2eBackend is a minimal offline-mode server: it accepts the proxy's replayed
// login, records the forwarded identity, and then echoes the session bytes.
type e2eBackend struct {
	listener   net.Listener
	handshakes chan string
	echoed     chan []byte
	// configures makes the backend walk a configuration phase after login,
	// which is the only thing a waiting world can be recorded from.
	configures bool
}

func newE2EBackend(t *testing.T) *e2eBackend {
	return newE2EBackendWith(t, false)
}

// newE2EBackendWith optionally makes the backend walk a configuration phase
// after the login, which is what a real 1.20.2+ server does and what the proxy
// records a waiting world from.
func newE2EBackendWith(t *testing.T, configures bool) *e2eBackend {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	be := &e2eBackend{
		listener:   ln,
		handshakes: make(chan string, 4),
		echoed:     make(chan []byte, 4),
		configures: configures,
	}
	t.Cleanup(func() { _ = ln.Close() })

	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			go be.serve(c)
		}
	}()
	return be
}

func (b *e2eBackend) port() int { return b.listener.Addr().(*net.TCPAddr).Port }

// configure plays a real server's configuration phase: the registry set, the end
// of the phase, and then the Login (play) that puts the player in the world.
// It is the whole of what a waiting world is recorded from.
func (b *e2eBackend) configure(conn *protocol.Conn, c net.Conn) {
	// The client's Login Acknowledged, relayed by the proxy.
	if _, err := conn.ReadPacket(); err != nil {
		return
	}
	registries := []*protocol.Packet{
		protocol.NewWriter(0x07).String("minecraft:dimension_type").Packet(),
		protocol.NewWriter(0x07).String("minecraft:worldgen/biome").Packet(),
		protocol.NewWriter(0x0D).String("tags").Packet(),
	}
	for _, pkt := range registries {
		if err := conn.WritePacket(pkt); err != nil {
			return
		}
	}
	if err := conn.WritePacket(protocol.NewWriter(0x03).Packet()); err != nil {
		return
	}

	// Everything the client sends before it acknowledges, then the
	// acknowledgement itself.
	for {
		pkt, err := conn.ReadPacket()
		if err != nil {
			return
		}
		if pkt.ID == 0x03 {
			break
		}
	}

	login := protocol.NewWriter(e2ePlayLoginID).String("the world").Packet()
	if err := conn.WritePacket(login); err != nil {
		return
	}
	_, _ = io.Copy(io.Discard, c)
}

func (b *e2eBackend) serve(c net.Conn) {
	defer c.Close()
	conn := protocol.NewConn(c)

	hs, err := conn.ReadPacket()
	if err != nil {
		return
	}
	r := protocol.NewReader(hs.Data)
	_, _ = r.VarInt()
	addr, _ := r.String(32767)
	select {
	case b.handshakes <- addr:
	default:
	}

	ls, err := conn.ReadPacket()
	if err != nil {
		return
	}
	lr := protocol.NewReader(ls.Data)
	name, _ := lr.String(16)
	id, _ := lr.UUID()

	success := protocol.NewWriter(idLoginSuccess).
		UUID(id).
		String(name).
		VarInt(0).
		Packet()
	if err := conn.WritePacket(success); err != nil {
		return
	}

	if b.configures {
		b.configure(conn, c)
		return
	}

	// Echo whatever the client sends, so the test can prove the tunnel is live.
	buf := make([]byte, 256)
	n, err := c.Read(buf)
	if err != nil {
		return
	}
	select {
	case b.echoed <- append([]byte(nil), buf[:n]...):
	default:
	}
	_, _ = c.Write(buf[:n])
}

// ─── Test client ──────────────────────────────────────────────────────────────

// e2eClient speaks just enough of the protocol to log in for real.
type e2eClient struct {
	t    *testing.T
	raw  net.Conn
	conn *protocol.Conn
	// cookie is what this client answers a cookie request with. Nil means it
	// has none, which is what a client that has never seen the waiting world
	// says.
	cookie []byte
}

func e2eDial(t *testing.T, addr, host string) *e2eClient {
	t.Helper()
	raw, err := net.DialTimeout("tcp", addr, 5*time.Second)
	if err != nil {
		t.Fatalf("dial proxy: %v", err)
	}
	t.Cleanup(func() { _ = raw.Close() })
	c := &e2eClient{t: t, raw: raw, conn: protocol.NewConn(raw)}

	hs := protocol.NewWriter(0x00).
		VarInt(e2eProtocol).
		String(host).
		UShort(25565).
		VarInt(stateLogin).
		Packet()
	if err := c.conn.WritePacket(hs); err != nil {
		t.Fatalf("send handshake: %v", err)
	}
	uid, err := protocol.ParseUUID(e2ePlayerUUID)
	if err != nil {
		t.Fatalf("parse uuid: %v", err)
	}
	start := protocol.NewWriter(idLoginStart).String("SmokeTester").UUID(uid).Packet()
	if err := c.conn.WritePacket(start); err != nil {
		t.Fatalf("send login start: %v", err)
	}
	return c
}

// encrypt completes the encryption exchange, exactly as a real client does.
func (c *e2eClient) encrypt() {
	c.t.Helper()
	pkt := c.expect(idEncryptionRequest)

	r := protocol.NewReader(pkt.Data)
	if _, err := r.String(20); err != nil {
		c.t.Fatalf("read server id: %v", err)
	}
	der, err := r.ByteArray()
	if err != nil {
		c.t.Fatalf("read public key: %v", err)
	}
	token, err := r.ByteArray()
	if err != nil {
		c.t.Fatalf("read verify token: %v", err)
	}

	pub, err := x509.ParsePKIXPublicKey(der)
	if err != nil {
		c.t.Fatalf("proxy sent a public key that is not valid DER: %v", err)
	}
	rsaPub, ok := pub.(*rsa.PublicKey)
	if !ok {
		c.t.Fatalf("proxy sent a %T, expected an RSA public key", pub)
	}

	secret := make([]byte, 16)
	if _, err := rand.Read(secret); err != nil {
		c.t.Fatalf("make shared secret: %v", err)
	}
	encSecret, err := rsa.EncryptPKCS1v15(rand.Reader, rsaPub, secret)
	if err != nil {
		c.t.Fatalf("encrypt shared secret: %v", err)
	}
	encToken, err := rsa.EncryptPKCS1v15(rand.Reader, rsaPub, token)
	if err != nil {
		c.t.Fatalf("encrypt verify token: %v", err)
	}

	resp := protocol.NewWriter(idEncryptionResponse).
		ByteArray(encSecret).
		ByteArray(encToken).
		Packet()
	if err := c.conn.WritePacket(resp); err != nil {
		c.t.Fatalf("send encryption response: %v", err)
	}
	if err := c.conn.EnableEncryption(secret); err != nil {
		c.t.Fatalf("enable encryption: %v", err)
	}
}

// expect reads one packet and asserts its id.
//
// A cookie request is answered and skipped rather than asserted on, because the
// proxy sends one on every modern login and a real client answers it without
// the player ever knowing. Every test would otherwise have to step over it.
func (c *e2eClient) expect(id int32) *protocol.Packet {
	c.t.Helper()
	for {
		_ = c.raw.SetReadDeadline(time.Now().Add(10 * time.Second))
		pkt, err := c.conn.ReadPacket()
		if err != nil {
			c.t.Fatalf("read packet (wanted 0x%02x): %v", id, err)
		}
		_ = c.raw.SetReadDeadline(time.Time{})

		if pkt.ID == idCookieRequest && id != idCookieRequest {
			c.answerCookie(pkt)
			continue
		}
		if pkt.ID != id {
			c.t.Fatalf("got packet 0x%02x, wanted 0x%02x", pkt.ID, id)
		}
		return pkt
	}
}

// answerCookie replies to a cookie request with whatever this client is
// carrying, which is usually nothing.
func (c *e2eClient) answerCookie(pkt *protocol.Packet) {
	c.t.Helper()
	key, err := protocol.NewReader(pkt.Data).String(32767)
	if err != nil {
		c.t.Fatalf("read cookie request key: %v", err)
	}
	w := protocol.NewWriter(idCookieResponse).String(key)
	if c.cookie != nil {
		w.Bool(true).ByteArray(c.cookie)
	} else {
		w.Bool(false)
	}
	if err := c.conn.WritePacket(w.Packet()); err != nil {
		c.t.Fatalf("send cookie response: %v", err)
	}
}

// answerHoldPing replies to one login plugin request, which is what keeps a
// held connection alive.
func (c *e2eClient) answerHoldPing() int32 {
	c.t.Helper()
	pkt := c.expect(idLoginPluginRequest)
	r := protocol.NewReader(pkt.Data)
	msgID, err := r.VarInt()
	if err != nil {
		c.t.Fatalf("read message id: %v", err)
	}
	channel, err := r.String(32767)
	if err != nil {
		c.t.Fatalf("read channel: %v", err)
	}
	if channel != holdChannel {
		c.t.Fatalf("hold ping used channel %q, wanted %q", channel, holdChannel)
	}
	reply := protocol.NewWriter(idLoginPluginResponse).VarInt(msgID).Bool(false).Packet()
	if err := c.conn.WritePacket(reply); err != nil {
		c.t.Fatalf("answer hold ping: %v", err)
	}
	return msgID
}

// ─── Harness ──────────────────────────────────────────────────────────────────

type e2eRig struct {
	bot     *e2eBot
	backend *e2eBackend
	addr    string
	hashes  chan string
}

func newE2ERig(t *testing.T, online, linked bool) *e2eRig {
	t.Helper()
	return newE2ERigWith(t, online, linked, nil)
}

// newE2ERigWith builds a rig whose proxy has somewhere to keep recorded worlds,
// which is what decides whether a waiting player is given one or held mutely.
func newE2ERigWith(t *testing.T, online, linked bool, snapshots limbo.Store) *e2eRig {
	return newE2ERigFull(t, online, linked, snapshots, false)
}

func newE2ERigFull(t *testing.T, online, linked bool, snapshots limbo.Store, configures bool) *e2eRig {
	t.Helper()

	backend := newE2EBackendWith(t, configures)
	bot := newE2EBot(t, backend.port(), online, linked)
	hashes := make(chan string, 4)
	session := newE2ESession(t, hashes)

	client := control.New(bot.server.URL, "token", nil)
	poller := control.NewPoller(client, 50*time.Millisecond)

	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	go poller.Run(ctx)

	select {
	case <-poller.Ready():
	case <-time.After(5 * time.Second):
		t.Fatal("poller never received a configuration")
	}

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	addr := ln.Addr().String()
	_ = ln.Close()

	proxy, err := New(Options{
		ListenAddr: addr,
		Control:    client,
		Poller:     poller,
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Verifier:   auth.NewVerifierAt(nil, session.URL),
		Snapshots:  snapshots,
	})
	if err != nil {
		t.Fatalf("build proxy: %v", err)
	}
	go func() { _ = proxy.ListenAndServe(ctx) }()

	waitForListener(t, addr)
	return &e2eRig{bot: bot, backend: backend, addr: addr, hashes: hashes}
}

func waitForListener(t *testing.T, addr string) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		c, err := net.DialTimeout("tcp", addr, 200*time.Millisecond)
		if err == nil {
			_ = c.Close()
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("proxy never listened on %s", addr)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

// TestJoinOnlineBackend covers the straight-through path: a running backend, a
// real encryption exchange, the forwarded identity, and a live tunnel.
func TestJoinOnlineBackend(t *testing.T) {
	rig := newE2ERig(t, true, true)

	client := e2eDial(t, rig.addr, "mc.example.com")
	client.encrypt()

	success := client.expect(idLoginSuccess)
	r := protocol.NewReader(success.Data)
	gotUUID, err := r.UUID()
	if err != nil {
		t.Fatalf("read login success uuid: %v", err)
	}
	if gotUUID.String() != e2ePlayerUUID {
		t.Errorf("login success carried uuid %s, wanted %s", gotUUID, e2ePlayerUUID)
	}
	name, err := r.String(16)
	if err != nil {
		t.Fatalf("read login success name: %v", err)
	}
	if name != "SmokeTester" {
		t.Errorf("login success carried name %q, wanted %q", name, "SmokeTester")
	}

	// The backend must have been handed the BungeeCord forwarding payload.
	select {
	case addr := <-rig.backend.handshakes:
		parts := strings.Split(addr, "\x00")
		if len(parts) != 4 {
			t.Fatalf("forwarded address had %d parts, wanted 4: %q", len(parts), addr)
		}
		if parts[0] != "mc.example.com" {
			t.Errorf("forwarded hostname was %q", parts[0])
		}
		if parts[1] != "127.0.0.1" {
			t.Errorf("forwarded client ip was %q", parts[1])
		}
		if want := strings.ReplaceAll(e2ePlayerUUID, "-", ""); parts[2] != want {
			t.Errorf("forwarded uuid was %q, wanted %q", parts[2], want)
		}
		var props []auth.Property
		if err := json.Unmarshal([]byte(parts[3]), &props); err != nil {
			t.Fatalf("forwarded properties are not JSON: %v (%q)", err, parts[3])
		}
		if len(props) != 1 || props[0].Name != "textures" {
			t.Errorf("forwarded properties were %+v", props)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("backend never saw a handshake")
	}

	// The session hash must have reached the stand-in session server.
	select {
	case <-rig.hashes:
	case <-time.After(time.Second):
		t.Error("the session server was never asked to verify the player")
	}

	// Prove the tunnel carries traffic in both directions, through the cipher.
	payload := []byte("hello through the tunnel")
	if _, err := client.conn.StreamWriter().Write(payload); err != nil {
		t.Fatalf("write through tunnel: %v", err)
	}
	select {
	case got := <-rig.backend.echoed:
		if string(got) != string(payload) {
			t.Errorf("backend received %q, wanted %q", got, payload)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("backend never received the tunnelled bytes")
	}

	echo := make([]byte, len(payload))
	_ = client.raw.SetReadDeadline(time.Now().Add(5 * time.Second))
	if _, err := io.ReadFull(client.conn.StreamReader(), echo); err != nil {
		t.Fatalf("read echo through tunnel: %v", err)
	}
	if string(echo) != string(payload) {
		t.Errorf("client received %q back, wanted %q", echo, payload)
	}
}

// TestHoldUntilBackendComesUp is the behaviour the whole proxy exists for: a
// player who arrives while the server is down waits, is kept alive, and is then
// joined without ever being disconnected.
func TestHoldUntilBackendComesUp(t *testing.T) {
	rig := newE2ERig(t, false, true)

	client := e2eDial(t, rig.addr, "mc.example.com")
	client.encrypt()

	// The proxy should ask the bot to start the server on the player's behalf.
	deadline := time.Now().Add(5 * time.Second)
	for rig.bot.startCalls.Load() == 0 && time.Now().Before(deadline) {
		time.Sleep(20 * time.Millisecond)
	}
	if got := rig.bot.startCalls.Load(); got == 0 {
		t.Fatal("the proxy never asked the bot to start the server")
	}

	// It should then hold the connection open rather than dropping or finishing
	// it, and the keep-alive must be a login plugin request the client answers.
	first := client.answerHoldPing()
	if first != 1 {
		t.Errorf("first hold ping had message id %d, wanted 1", first)
	}

	// Bring the backend up; the hold must resolve into a real join.
	rig.bot.setOnline(true)

	// More hold pings may arrive before the poller notices; answer until the
	// login completes.
	for i := 0; i < 20; i++ {
		_ = client.raw.SetReadDeadline(time.Now().Add(10 * time.Second))
		pkt, err := client.conn.ReadPacket()
		if err != nil {
			t.Fatalf("read while waiting for login success: %v", err)
		}
		switch pkt.ID {
		case idLoginPluginRequest:
			r := protocol.NewReader(pkt.Data)
			msgID, _ := r.VarInt()
			reply := protocol.NewWriter(idLoginPluginResponse).VarInt(msgID).Bool(false).Packet()
			if err := client.conn.WritePacket(reply); err != nil {
				t.Fatalf("answer hold ping: %v", err)
			}
		case idLoginSuccess:
			r := protocol.NewReader(pkt.Data)
			gotUUID, err := r.UUID()
			if err != nil {
				t.Fatalf("read uuid: %v", err)
			}
			if gotUUID.String() != e2ePlayerUUID {
				t.Errorf("login success carried %s, wanted %s", gotUUID, e2ePlayerUUID)
			}
			return
		case idLoginDisconnect:
			r := protocol.NewReader(pkt.Data)
			msg, _ := r.String(32767)
			t.Fatalf("the held player was disconnected: %s", msg)
		default:
			t.Fatalf("unexpected packet 0x%02x while held", pkt.ID)
		}
	}
	t.Fatal("the hold never resolved into a login")
}

// TestUnlinkedPlayerIsLetThrough checks that the proxy does not gate on
// verification at all.
//
// Linking is the game side's business: a player who has not linked yet joins
// like anyone else and completes /link on Discord from in game, exactly as they
// did before the proxy existed. The proxy turning them away here would have
// made that impossible, since the server has to be running for /link to work.
func TestUnlinkedPlayerIsLetThrough(t *testing.T) {
	rig := newE2ERig(t, true, false)

	client := e2eDial(t, rig.addr, "mc.example.com")
	client.encrypt()

	pkt := client.expect(idLoginSuccess)
	r := protocol.NewReader(pkt.Data)
	gotUUID, err := r.UUID()
	if err != nil {
		t.Fatalf("read login success uuid: %v", err)
	}
	if gotUUID.String() != e2ePlayerUUID {
		t.Errorf("login success carried uuid %s, wanted %s", gotUUID, e2ePlayerUUID)
	}

	select {
	case <-rig.backend.handshakes:
	case <-time.After(5 * time.Second):
		t.Fatal("an unlinked player never reached the backend")
	}
}

// TestUnlinkedPlayerIsHeldWithoutRequestingAStart checks the one thing that
// does stay gated. Starting a server needs a Discord account to check
// permission against and charge, so an unlinked player waits instead of having
// a request raised in their name. They are still not turned away.
func TestUnlinkedPlayerIsHeldWithoutRequestingAStart(t *testing.T) {
	rig := newE2ERig(t, false, false)

	client := e2eDial(t, rig.addr, "mc.example.com")
	client.encrypt()

	// The hold is live: the client is being kept alive rather than dropped.
	client.answerHoldPing()

	if got := rig.bot.startCalls.Load(); got != 0 {
		t.Errorf("the bot was asked to start a server %d times for an unlinked player, wanted 0", got)
	}

	// Once the server is up by other means, they are joined like anyone else.
	rig.bot.setOnline(true)
	for i := 0; i < 20; i++ {
		_ = client.raw.SetReadDeadline(time.Now().Add(10 * time.Second))
		pkt, err := client.conn.ReadPacket()
		if err != nil {
			t.Fatalf("read while waiting for login success: %v", err)
		}
		switch pkt.ID {
		case idLoginPluginRequest:
			r := protocol.NewReader(pkt.Data)
			msgID, _ := r.VarInt()
			reply := protocol.NewWriter(idLoginPluginResponse).VarInt(msgID).Bool(false).Packet()
			if err := client.conn.WritePacket(reply); err != nil {
				t.Fatalf("answer hold ping: %v", err)
			}
		case idLoginSuccess:
			return
		case idLoginDisconnect:
			r := protocol.NewReader(pkt.Data)
			msg, _ := r.String(32767)
			t.Fatalf("the unlinked player was disconnected: %s", msg)
		default:
			t.Fatalf("unexpected packet 0x%02x while held", pkt.ID)
		}
	}
	t.Fatal("the hold never resolved into a login")
}

// TestForcedHostSelectsServer pins the one selection mechanism available during
// a hold: the hostname the player typed.
func TestForcedHostSelectsServer(t *testing.T) {
	t.Parallel()

	sess := &control.Session{
		Linked: true,
		Servers: []control.SessionServerInfo{
			{ID: 1, Tag: "Survival", Online: false, Accessible: true},
			{ID: 2, Tag: "Hard Mode", Online: true, Accessible: true},
			{ID: 3, Tag: "Private", Online: true, Accessible: false},
		},
	}

	cases := []struct {
		name       string
		host       string
		wantID     int
		wantOnline bool
	}{
		{"an offline server named by host beats an online one", "survival.example.com", 1, false},
		{"a multi-word tag matches its hyphenated form", "hard-mode.example.com", 2, true},
		{"a bare label works as well as a full hostname", "survival", 1, false},
		{"matching is case-insensitive", "SURVIVAL.example.com", 1, false},
		{"an unmatched host falls back to an online server", "mc.example.com", 2, true},
		{"a host naming an inaccessible server is ignored", "private.example.com", 2, true},
	}

	p := &Proxy{}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			id, online := p.chooseTarget(sess, cleanHost(tc.host))
			if id != tc.wantID || online != tc.wantOnline {
				t.Errorf("chooseTarget(%q) = (%d, %v), wanted (%d, %v)",
					tc.host, id, online, tc.wantID, tc.wantOnline)
			}
		})
	}
}

// TestLegacyClientCannotBeHeld checks that a client too old for the keep-alive
// is told why instead of being left to time out on its own.
func TestLegacyClientCannotBeHeld(t *testing.T) {
	t.Parallel()

	rig := newE2ERig(t, false, true)

	raw, err := net.DialTimeout("tcp", rig.addr, 5*time.Second)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer raw.Close()
	conn := protocol.NewConn(raw)

	// Protocol 47 is 1.8: old enough to have no login plugin messages.
	hs := protocol.NewWriter(0x00).VarInt(47).String("mc.example.com").UShort(25565).VarInt(stateLogin).Packet()
	if err := conn.WritePacket(hs); err != nil {
		t.Fatalf("send handshake: %v", err)
	}
	if err := conn.WritePacket(protocol.NewWriter(idLoginStart).String("OldTimer").Packet()); err != nil {
		t.Fatalf("send login start: %v", err)
	}

	c := &e2eClient{t: t, raw: raw, conn: conn}
	c.encrypt()

	pkt := c.expect(idLoginDisconnect)
	r := protocol.NewReader(pkt.Data)
	body, _ := r.String(32767)
	if !strings.Contains(body, "too old to be held") {
		t.Errorf("a 1.8 client got %q, wanted an explanation that it cannot be held", body)
	}
}

func TestE2ESanity(t *testing.T) {
	t.Parallel()
	if fmt.Sprintf("%d", e2eProtocol) == "" {
		t.Fatal("unreachable")
	}
}

// TestSessionCarriesTheOfflineIdentity covers the path that makes a backend
// with no forwarding usable: the proxy authenticates the player itself and
// tells the bot both who they really are and who that backend will think they
// are, so a link made in game still resolves here.
func TestSessionCarriesTheOfflineIdentity(t *testing.T) {
	rig := newE2ERig(t, true, true)

	client := e2eDial(t, rig.addr, "mc.example.com")
	client.encrypt()
	client.expect(idLoginSuccess)

	select {
	case body := <-rig.bot.sessions:
		if got := body["uuid"]; got != e2ePlayerUUID {
			t.Errorf("session uuid = %v, want the verified %s", got, e2ePlayerUUID)
		}
		want := protocol.OfflineUUID("SmokeTester").String()
		if got := body["offlineUuid"]; got != want {
			t.Errorf("session offlineUuid = %v, want %s", got, want)
		}
		if got := body["name"]; got != "SmokeTester" {
			t.Errorf("session name = %v", got)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("the bot never saw a session request")
	}
}

// ─── The waiting world ────────────────────────────────────────────────────────

// Play-phase packet ids for the protocol the end-to-end client speaks. They are
// spelled out here rather than read from the limbo package so that a change to
// that table has to be made twice, deliberately, rather than silently agreeing
// with itself.
const (
	e2ePlayLoginID       = 0x2B
	e2ePlayAbilities     = 0x38
	e2ePlayGameEvent     = 0x22
	e2ePlayPosition      = 0x40
	e2ePlaySystemChat    = 0x6C
	e2ePlayKeepAlive     = 0x26
	e2ePlayStoreCookie   = 0x6B
	e2ePlayTransfer      = 0x73
	e2eSbPlayKeepAlive   = 0x18
	e2eSbChatCommand     = 0x04
	e2eLoginAcknowledged = 0x03
	e2eAckConfiguration  = 0x03
)

// e2eWorldStore is a recorded world for the version the test client speaks. The
// packets are not real registry data: the proxy replays them without looking
// inside, and pretending otherwise would test a property it does not have.
func e2eWorldStore(t *testing.T) limbo.Store {
	t.Helper()
	store := limbo.NewMemoryStore()
	err := store.Put(&limbo.Snapshot{
		Protocol:   e2eProtocol,
		Config:     []protocol.Packet{{ID: 0x07, Data: []byte("registries")}},
		LoginPlay:  protocol.Packet{ID: e2ePlayLoginID, Data: []byte("the world")},
		Source:     "Survival",
		RecordedAt: time.Now(),
	})
	if err != nil {
		t.Fatalf("seed the recorded world: %v", err)
	}
	return store
}

// enterWaitingWorld walks the client from an authenticated login to standing in
// the waiting world, and returns the greeting it was shown.
func (c *e2eClient) enterWaitingWorld() []string {
	c.t.Helper()

	c.expect(idLoginSuccess)
	c.mustWrite(protocol.NewWriter(e2eLoginAcknowledged).Packet())

	c.expect(0x07)                    // the recorded registry data
	c.expect(cbFinishConfigurationID) // the proxy's own finish
	c.mustWrite(protocol.NewWriter(e2eAckConfiguration).Packet())

	c.expect(e2ePlayLoginID)
	c.expect(e2ePlayAbilities)
	c.expect(e2ePlayGameEvent)
	c.expect(e2ePlayPosition)

	// The greeting is several lines, and the last of them names the command to
	// type, so reading until that appears is reading the whole of it.
	var lines []string
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		line := c.readChatLine()
		lines = append(lines, line)
		if strings.Contains(line, "/join") {
			return lines
		}
	}
	c.t.Fatalf("the waiting world never said how to choose; it said %q", lines)
	return nil
}

// cbFinishConfigurationID is the clientbound Finish Configuration the proxy
// sends to end the phase.
const cbFinishConfigurationID = 0x03

// readChatLine reads until a line of chat arrives, answering keep-alives on the
// way as a real client does.
func (c *e2eClient) readChatLine() string {
	c.t.Helper()
	for {
		_ = c.raw.SetReadDeadline(time.Now().Add(10 * time.Second))
		pkt, err := c.conn.ReadPacket()
		if err != nil {
			c.t.Fatalf("read while waiting for chat: %v", err)
		}
		switch pkt.ID {
		case e2ePlayKeepAlive:
			id, err := protocol.NewReader(pkt.Data).Long()
			if err != nil {
				c.t.Fatalf("keep-alive has no id: %v", err)
			}
			c.mustWrite(protocol.NewWriter(e2eSbPlayKeepAlive).Long(id).Packet())
		case e2ePlaySystemChat:
			return chatText(c.t, pkt)
		default:
			c.t.Fatalf("unexpected packet 0x%02x in the waiting world", pkt.ID)
		}
	}
}

// readUntilTransfer reads until the player is handed back to the proxy,
// returning the cookie that carries their choice.
func (c *e2eClient) readUntilTransfer() (cookie []byte, host string, port int32) {
	c.t.Helper()
	deadline := time.Now().Add(20 * time.Second)
	for time.Now().Before(deadline) {
		_ = c.raw.SetReadDeadline(time.Now().Add(10 * time.Second))
		pkt, err := c.conn.ReadPacket()
		if err != nil {
			c.t.Fatalf("read while waiting for the transfer: %v", err)
		}
		switch pkt.ID {
		case e2ePlayKeepAlive:
			id, _ := protocol.NewReader(pkt.Data).Long()
			c.mustWrite(protocol.NewWriter(e2eSbPlayKeepAlive).Long(id).Packet())
		case e2ePlaySystemChat:
			// Progress reports while the server starts.
		case e2ePlayStoreCookie:
			r := protocol.NewReader(pkt.Data)
			if _, err := r.String(32767); err != nil {
				c.t.Fatalf("cookie has no key: %v", err)
			}
			cookie, err = r.ByteArray()
			if err != nil {
				c.t.Fatalf("cookie has no payload: %v", err)
			}
		case e2ePlayTransfer:
			r := protocol.NewReader(pkt.Data)
			host, _ = r.String(32767)
			port, _ = r.VarInt()
			return cookie, host, port
		default:
			c.t.Fatalf("unexpected packet 0x%02x while waiting for the transfer", pkt.ID)
		}
	}
	c.t.Fatal("the player was never transferred")
	return nil, "", 0
}

func (c *e2eClient) mustWrite(pkt *protocol.Packet) {
	c.t.Helper()
	if err := c.conn.WritePacket(pkt); err != nil {
		c.t.Fatalf("write packet 0x%02x: %v", pkt.ID, err)
	}
}

// chatText pulls the readable text out of a system chat packet, which is a
// component followed by the flag that chooses chat or the action bar.
func chatText(t *testing.T, pkt *protocol.Packet) string {
	t.Helper()
	if len(pkt.Data) < 2 {
		t.Fatalf("system chat packet is %d bytes", len(pkt.Data))
	}
	root, err := nbt.Unmarshal(pkt.Data[:len(pkt.Data)-1], true)
	if err != nil {
		t.Fatalf("chat content is not network NBT: %v", err)
	}
	var b strings.Builder
	if s, ok := root["text"].(nbt.String); ok {
		b.WriteString(string(s))
	}
	if extra, ok := root["extra"].(nbt.List); ok {
		for _, elem := range extra.Elems {
			run, ok := elem.(nbt.Compound)
			if !ok {
				continue
			}
			if s, ok := run["text"].(nbt.String); ok {
				b.WriteString(string(s))
			}
		}
	}
	return b.String()
}

// TestWaitingWorldStartsAServerAndHandsThePlayerOver is the whole feature end to
// end: a player arrives while the server is down, is put into a world where the
// proxy can talk to them, asks for the server themselves, and is transferred to
// it the moment it is up — without ever being disconnected.
func TestWaitingWorldStartsAServerAndHandsThePlayerOver(t *testing.T) {
	rig := newE2ERigWith(t, false, true, e2eWorldStore(t))

	client := e2eDial(t, rig.addr, "mc.example.com")
	client.encrypt()

	greeting := client.enterWaitingWorld()
	if !strings.Contains(strings.Join(greeting, "\n"), "Survival") {
		t.Errorf("the greeting never named the server: %q", greeting)
	}

	// Nothing has been asked of the bot yet. A player in the waiting world
	// chooses for themselves, unlike a held one who is acted for.
	if got := rig.bot.startCalls.Load(); got != 0 {
		t.Fatalf("the proxy asked for a start before the player did (%d times)", got)
	}

	client.mustWrite(protocol.NewWriter(e2eSbChatCommand).String("join survival").Packet())

	deadline := time.Now().Add(10 * time.Second)
	for rig.bot.startCalls.Load() == 0 && time.Now().Before(deadline) {
		time.Sleep(20 * time.Millisecond)
	}
	if rig.bot.startCalls.Load() == 0 {
		t.Fatal("typing /join never reached the bot as a start request")
	}

	rig.bot.setOnline(true)

	cookie, host, port := client.readUntilTransfer()
	if host != "mc.example.com" {
		t.Errorf("transferred to %q, wanted the address the client itself used", host)
	}
	if port == 0 {
		t.Error("transferred to port 0")
	}
	if len(cookie) == 0 {
		t.Fatal("no choice was stored; the player would arrive having apparently chosen nothing")
	}
	server, ok := decodeChoice(cookie, time.Now())
	if !ok || server != 1 {
		t.Errorf("stored choice was %d (ok=%v), wanted server 1", server, ok)
	}
}

// TestWaitingWorldIsNotUsedWhenNothingHasBeenRecorded pins the fallback: with no
// recording for the client's version there is no world to build, and the player
// is held mid-login exactly as they were before the world existed.
func TestWaitingWorldIsNotUsedWhenNothingHasBeenRecorded(t *testing.T) {
	rig := newE2ERigWith(t, false, true, limbo.NewMemoryStore())

	client := e2eDial(t, rig.addr, "mc.example.com")
	client.encrypt()

	// A hold keeps the connection alive with login plugin requests; a world
	// would have sent Login Success by now.
	if id := client.answerHoldPing(); id != 1 {
		t.Errorf("first hold ping had message id %d, wanted 1", id)
	}
}

// TestHoldResolvingIntoAJoinRecordsTheWaitingWorld pins the sequence that makes
// the cold start a single event rather than a standing requirement.
//
// A player who arrives while everything is down is held, their join is treated
// as the request to start, and when the server comes up they are joined to it.
// That join is a configuration phase going past, so it is also the moment the
// proxy learns what a world for their client version looks like — which means
// the very first person through the door pays the cold start for everyone, on
// whichever path they took.
func TestHoldResolvingIntoAJoinRecordsTheWaitingWorld(t *testing.T) {
	store := limbo.NewMemoryStore()
	rig := newE2ERigFull(t, false, true, store, true)

	client := e2eDial(t, rig.addr, "mc.example.com")
	client.encrypt()

	// Nothing is recorded yet, so this player gets the mute hold.
	if _, ok := store.Get(e2eProtocol); ok {
		t.Fatal("a world was recorded before anybody joined a running server")
	}
	client.answerHoldPing()

	rig.bot.setOnline(true)

	// Answer hold pings until the hold resolves into a real login.
	for i := 0; i < 20; i++ {
		_ = client.raw.SetReadDeadline(time.Now().Add(10 * time.Second))
		pkt, err := client.conn.ReadPacket()
		if err != nil {
			t.Fatalf("read while waiting for the hold to resolve: %v", err)
		}
		if pkt.ID == idLoginPluginRequest {
			r := protocol.NewReader(pkt.Data)
			msgID, _ := r.VarInt()
			client.mustWrite(protocol.NewWriter(idLoginPluginResponse).
				VarInt(msgID).Bool(false).Packet())
			continue
		}
		if pkt.ID == idLoginSuccess {
			break
		}
		t.Fatalf("unexpected packet 0x%02x while the hold resolved", pkt.ID)
	}

	// From here the client is joining the backend for real, and the proxy is
	// watching the configuration phase go past.
	client.mustWrite(protocol.NewWriter(e2eLoginAcknowledged).Packet())
	client.expect(0x07)
	client.expect(0x07)
	client.expect(0x0D)
	client.expect(0x03)
	client.mustWrite(protocol.NewWriter(e2eAckConfiguration).Packet())
	client.expect(e2ePlayLoginID)

	// The recording has to be filed now, while this player is still on the
	// server, or everybody arriving behind them waits for a world that exists.
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if snap, ok := store.Get(e2eProtocol); ok {
			if len(snap.Config) != 3 {
				t.Errorf("recorded %d configuration packets, wanted 3", len(snap.Config))
			}
			if string(snap.LoginPlay.Data) == "" {
				t.Error("no login (play) packet was recorded")
			}
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("the join that ended the hold taught the proxy nothing; the cold start would never end")
}
