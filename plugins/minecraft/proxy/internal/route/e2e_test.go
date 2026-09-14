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
	server       *httptest.Server
}

func newE2EBot(t *testing.T, backendPort int, online, linked bool) *e2eBot {
	t.Helper()
	bot := &e2eBot{online: online, backendPort: backendPort, linked: linked}

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
}

func newE2EBackend(t *testing.T) *e2eBackend {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	be := &e2eBackend{
		listener:   ln,
		handshakes: make(chan string, 4),
		echoed:     make(chan []byte, 4),
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
func (c *e2eClient) expect(id int32) *protocol.Packet {
	c.t.Helper()
	_ = c.raw.SetReadDeadline(time.Now().Add(10 * time.Second))
	pkt, err := c.conn.ReadPacket()
	if err != nil {
		c.t.Fatalf("read packet (wanted 0x%02x): %v", id, err)
	}
	if pkt.ID != id {
		c.t.Fatalf("got packet 0x%02x, wanted 0x%02x", pkt.ID, id)
	}
	_ = c.raw.SetReadDeadline(time.Time{})
	return pkt
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

	backend := newE2EBackend(t)
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
