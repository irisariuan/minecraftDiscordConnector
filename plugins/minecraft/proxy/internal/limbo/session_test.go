package limbo

import (
	"context"
	"io"
	"log/slog"
	"net"
	"testing"
	"time"

	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/nbt"
	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/protocol"
)

// The waiting world is the one part of this proxy that talks to a client with
// nothing behind it, so these tests stand a fake client on the other end of a
// real socket and walk the whole sequence: log in, replay a recorded
// configuration phase, enter the play phase, say something, take a command and
// transfer. Nothing here can prove a real Minecraft client agrees — only a real
// client can — but it does prove the proxy sends what it believes it sends, in
// the order it believes, and reads back what a client would send.

const testProtocol = 767

// fakeClient is the other end of the connection.
type fakeClient struct {
	t    *testing.T
	raw  net.Conn
	conn *protocol.Conn
}

func (c *fakeClient) read() *protocol.Packet {
	c.t.Helper()
	_ = c.raw.SetReadDeadline(time.Now().Add(5 * time.Second))
	pkt, err := c.conn.ReadPacket()
	if err != nil {
		c.t.Fatalf("read packet: %v", err)
	}
	return pkt
}

// expect reads until it finds the packet asked for, answering keep-alives on
// the way as a real client does. They arrive on their own schedule and would
// otherwise land in the middle of whatever a test is looking at.
func (c *fakeClient) expect(id int32, what string) *protocol.Packet {
	c.t.Helper()
	for {
		pkt := c.read()
		if pkt.ID == profiles[testProtocol].keepAlive && id != profiles[testProtocol].keepAlive {
			echo, err := protocol.NewReader(pkt.Data).Long()
			if err != nil {
				c.t.Fatalf("keep-alive has no id: %v", err)
			}
			c.send(protocol.NewWriter(profiles[testProtocol].sbKeepAlive).Long(echo).Packet())
			continue
		}
		if pkt.ID != id {
			c.t.Fatalf("got packet 0x%02x where %s (0x%02x) was expected", pkt.ID, what, id)
		}
		return pkt
	}
}

func (c *fakeClient) send(pkt *protocol.Packet) {
	c.t.Helper()
	if err := c.conn.WritePacket(pkt); err != nil {
		c.t.Fatalf("write packet 0x%02x: %v", pkt.ID, err)
	}
}

// testSnapshot is a stand-in for a recording taken off a real backend. The
// contents are deliberately not valid registry data: the waiting world never
// looks inside them, and a test that pretended otherwise would be testing a
// property the code does not have.
func testSnapshot() *Snapshot {
	return &Snapshot{
		Protocol: testProtocol,
		Config: []protocol.Packet{
			{ID: 0x07, Data: []byte("registry one")},
			{ID: 0x07, Data: []byte("registry two")},
			{ID: 0x0D, Data: []byte("tags")},
		},
		LoginPlay:  protocol.Packet{ID: 0x2B, Data: []byte("login play")},
		Source:     "Survival",
		RecordedAt: time.Now(),
	}
}

// enterWorld runs a whole entry sequence and hands back both ends.
func enterWorld(t *testing.T) (*Session, *fakeClient) {
	t.Helper()

	serverRaw, clientRaw := socketPair(t)
	client := &fakeClient{t: t, raw: clientRaw, conn: protocol.NewConn(clientRaw)}
	snap := testSnapshot()

	type result struct {
		session *Session
		err     error
	}
	done := make(chan result, 1)
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)

	go func() {
		s, err := Enter(ctx, protocol.NewConn(serverRaw), Options{
			Protocol: testProtocol,
			Name:     "SmokeTester",
			UUID:     protocol.OfflineUUID("SmokeTester"),
			Snapshot: snap,
			Logger:   slog.New(slog.DiscardHandler),
		})
		done <- result{s, err}
	}()

	// Login Success, then the acknowledgement a real client answers with.
	success := client.expect(idLoginSuccess, "login success")
	r := protocol.NewReader(success.Data)
	if _, err := r.UUID(); err != nil {
		t.Fatalf("login success has no uuid: %v", err)
	}
	name, err := r.String(16)
	if err != nil {
		t.Fatalf("login success has no name: %v", err)
	}
	if name != "SmokeTester" {
		t.Errorf("login success named %q, wanted the verified name", name)
	}
	client.send(protocol.NewWriter(idLoginAcknowledged).Packet())

	// The recorded configuration phase, verbatim and in order.
	for i, want := range snap.Config {
		got := client.read()
		if got.ID != want.ID || string(got.Data) != string(want.Data) {
			t.Fatalf("configuration packet %d was 0x%02x %q, wanted 0x%02x %q",
				i, got.ID, got.Data, want.ID, want.Data)
		}
	}
	client.expect(cbFinishConfiguration, "finish configuration")

	// A real client sends its settings and its brand before acknowledging, and
	// the proxy has to read past them to find the acknowledgement.
	client.send(protocol.NewWriter(0x00).String("en_us").Packet())
	client.send(protocol.NewWriter(0x02).String("minecraft:brand").Packet())
	client.send(protocol.NewWriter(sbAckFinishConfiguration).Packet())

	res := <-done
	if res.err != nil {
		t.Fatalf("entering the waiting world: %v", res.err)
	}
	t.Cleanup(func() { _ = res.session.Close() })
	return res.session, client
}

func TestEnterPutsThePlayerInTheWorld(t *testing.T) {
	t.Parallel()

	_, client := enterWorld(t)
	prof := profiles[testProtocol]

	login := client.expect(prof.gameEventLoginID(), "login (play)")
	if string(login.Data) != "login play" {
		t.Errorf("login (play) was %q, wanted the recorded packet replayed verbatim", login.Data)
	}

	abilities := client.expect(prof.playerAbilities, "player abilities")
	flags, err := protocol.NewReader(abilities.Data).Byte()
	if err != nil {
		t.Fatalf("player abilities has no flags: %v", err)
	}
	// Invulnerable and flying, but deliberately not "allowed to fly": a player
	// who can stop flying falls out of a world with no floor.
	if flags&playerAbilityInvulnerable == 0 {
		t.Error("the player is not invulnerable; the void will kill them while they read")
	}
	if flags&playerAbilityFlying == 0 {
		t.Error("the player is not flying")
	}
	if flags&0x04 != 0 {
		t.Error("the player is allowed to stop flying, and there is nothing to stand on")
	}

	event := client.expect(prof.gameEvent, "game event")
	er := protocol.NewReader(event.Data)
	which, err := er.UByte()
	if err != nil {
		t.Fatalf("game event has no event id: %v", err)
	}
	if which != gameEventStartWaitingForChunks {
		t.Errorf("game event was %d, wanted %d: without it the client never leaves its loading screen",
			which, gameEventStartWaitingForChunks)
	}

	// The position is the other half of leaving the loading screen. No chunk is
	// ever sent, so the player has to be below the world for the client to
	// consider them spawned.
	pos := client.expect(prof.syncPosition, "synchronize player position")
	pr := protocol.NewReader(pos.Data)
	if prof.modernSyncPosition {
		// From 1.21.2 the teleport id leads the packet rather than trailing it.
		if _, err := pr.VarInt(); err != nil {
			t.Fatalf("position has no teleport id: %v", err)
		}
	}
	if _, err := pr.Double(); err != nil {
		t.Fatalf("position has no x: %v", err)
	}
	y, err := pr.Double()
	if err != nil {
		t.Fatalf("position has no y: %v", err)
	}
	if y > -2032 {
		t.Errorf("player was put at y=%v, which is inside the deepest world a dimension may declare; "+
			"they would sit on a loading screen for thirty seconds", y)
	}
}

// gameEventLoginID is the id the recorded Login (play) packet carries. It is
// the backend's own, replayed, so it is read from the snapshot rather than from
// the version table — which is the point of replaying it.
func (p profile) gameEventLoginID() int32 { return 0x2B }

func TestSayReachesThePlayerAsAStyledComponent(t *testing.T) {
	t.Parallel()

	session, client := enterWorld(t)
	drainSpawn(t, client)

	if err := session.Say("§aSurvival§7 is running"); err != nil {
		t.Fatalf("say: %v", err)
	}

	chat := client.expect(profiles[testProtocol].systemChat, "system chat")
	// The packet is the component followed by the overlay flag, which decides
	// whether the line goes to the chat or to the action bar above the hotbar.
	if len(chat.Data) < 2 {
		t.Fatalf("system chat packet is %d bytes", len(chat.Data))
	}
	if overlay := chat.Data[len(chat.Data)-1]; overlay != 0 {
		t.Errorf("overlay flag is %d; the waiting world's text belongs in the chat, not the action bar", overlay)
	}
	root, err := nbt.Unmarshal(chat.Data[:len(chat.Data)-1], true)
	if err != nil {
		t.Fatalf("chat content is not network NBT: %v", err)
	}
	extra, ok := root["extra"].(nbt.List)
	if !ok || len(extra.Elems) == 0 {
		t.Fatalf("chat component has no styled runs: %+v", root)
	}
	first, ok := extra.Elems[0].(nbt.Compound)
	if !ok {
		t.Fatalf("first run is %T, wanted a compound", extra.Elems[0])
	}
	if got := first["color"]; got != nbt.String("green") {
		t.Errorf("first run colour is %v, wanted green: the § code must become a real component field", got)
	}
	if got := first["text"]; got != nbt.String("Survival") {
		t.Errorf("first run text is %v, wanted %q", got, "Survival")
	}
	// Nothing may carry a section sign onto the wire: whether a modern client
	// still renders one inside a component is undocumented.
	for _, b := range chat.Data {
		if b == 0xA7 {
			t.Fatalf("a section sign reached the client in %q", chat.Data)
		}
	}
}

func TestCommandsArriveFromEveryWayAPlayerCanType(t *testing.T) {
	t.Parallel()

	prof := profiles[testProtocol]
	cases := []struct {
		name string
		id   int32
	}{
		{"an unsigned command, which is what a command with no signable arguments sends", prof.sbChatCommand},
		{"a signed command, whose extra fields are of no interest", prof.sbChatCommandSigned},
		{"plain chat, for somebody who did not type a slash", prof.sbChatMessage},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			session, client := enterWorld(t)
			drainSpawn(t, client)

			client.send(protocol.NewWriter(tc.id).String("join survival").Packet())

			select {
			case got := <-session.Commands():
				if got != "join survival" {
					t.Errorf("command was %q, wanted %q", got, "join survival")
				}
			case <-time.After(5 * time.Second):
				t.Fatal("the command never arrived")
			}
		})
	}
}

func TestTransferCarriesTheAddressToComeBackTo(t *testing.T) {
	t.Parallel()

	session, client := enterWorld(t)
	drainSpawn(t, client)

	if err := session.StoreCookie("mcproxy:target", []byte("7:1700000000")); err != nil {
		t.Fatalf("store cookie: %v", err)
	}
	if err := session.Transfer("mc.example.com", 25565); err != nil {
		t.Fatalf("transfer: %v", err)
	}

	prof := profiles[testProtocol]
	cookie := client.expect(prof.storeCookie, "store cookie")
	cr := protocol.NewReader(cookie.Data)
	key, err := cr.String(32767)
	if err != nil {
		t.Fatalf("cookie has no key: %v", err)
	}
	if key != "mcproxy:target" {
		t.Errorf("cookie key was %q", key)
	}
	payload, err := cr.ByteArray()
	if err != nil {
		t.Fatalf("cookie has no payload: %v", err)
	}
	if string(payload) != "7:1700000000" {
		t.Errorf("cookie payload was %q", payload)
	}

	// The cookie has to be stored before the transfer, or the client leaves
	// without it and arrives having apparently chosen nothing.
	transfer := client.expect(prof.transfer, "transfer")
	tr := protocol.NewReader(transfer.Data)
	host, err := tr.String(32767)
	if err != nil {
		t.Fatalf("transfer has no host: %v", err)
	}
	port, err := tr.VarInt()
	if err != nil {
		t.Fatalf("transfer has no port: %v", err)
	}
	if host != "mc.example.com" || port != 25565 {
		t.Errorf("transfer pointed at %s:%d", host, port)
	}
}

func TestKeepAliveGoesOutImmediately(t *testing.T) {
	t.Parallel()

	_, client := enterWorld(t)
	drainSpawn(t, client)

	// The client starts its twenty-second timeout the moment it enters the play
	// phase, not when the first keep-alive arrives, so waiting a full interval
	// before the first one would spend half that budget for nothing.
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if pkt := client.read(); pkt.ID == profiles[testProtocol].keepAlive {
			return
		}
	}
	t.Fatal("no keep-alive arrived promptly after entering the play phase")
}

func TestCommandsChannelClosesWhenThePlayerGoesAway(t *testing.T) {
	t.Parallel()

	session, client := enterWorld(t)
	drainSpawn(t, client)

	_ = client.raw.Close()

	select {
	case _, open := <-session.Commands():
		if open {
			t.Error("a command arrived from a closed connection")
		}
	case <-time.After(5 * time.Second):
		t.Fatal("the commands channel never closed; the caller would wait forever")
	}
}

func TestEnterRefusesWhatItCannotBuild(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		opts Options
	}{
		{
			name: "a version with no packet numbering",
			opts: Options{Protocol: 774, Snapshot: &Snapshot{Protocol: 774}},
		},
		{
			name: "no recording for this version",
			opts: Options{Protocol: testProtocol},
		},
		{
			// Replaying one version's registry set to another version's client
			// is the exact mistake the recording design exists to prevent.
			name: "a recording made for a different version",
			opts: Options{Protocol: testProtocol, Snapshot: &Snapshot{Protocol: 770}},
		},
		{
			// A recording that describes no world would take the client into
			// the play phase with none of the registries it insists on, which
			// disconnects it at the end of configuration.
			name: "a recording that describes no world",
			opts: Options{Protocol: testProtocol, Snapshot: &Snapshot{Protocol: testProtocol}},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			serverRaw, clientRaw := socketPair(t)

			// Nothing may be written before the refusal: the caller still has a
			// clean connection to fall back to a hold with.
			read := make(chan int, 1)
			go func() {
				buf := make([]byte, 1)
				n, _ := io.ReadFull(clientRaw, buf)
				read <- n
			}()

			opts := tc.opts
			opts.Logger = slog.New(slog.DiscardHandler)
			if _, err := Enter(context.Background(), protocol.NewConn(serverRaw), opts); err == nil {
				t.Fatal("Enter accepted a world it cannot build")
			}

			_ = serverRaw.Close()
			if n := <-read; n != 0 {
				t.Error("Enter wrote to the client before refusing")
			}
		})
	}
}

// socketPair returns two ends of a real TCP connection.
//
// net.Pipe would be simpler but is unbuffered, and every write blocks until the
// other end reads. Entering the waiting world writes four packets in a row
// before it returns, so a test that reads them after Enter returns would
// deadlock against a pipe — and the deadlock would be the test's, not the
// proxy's, which is the worst kind to debug.
// A client that authenticates and then says nothing must not be able to hold a
// connection and a goroutine open for ever.
//
// It is an easy case to leave unbounded, because it is not reachable without a
// real Mojang session: the client has to complete the encryption exchange
// before it gets here. That makes it rare, not harmless — one account could
// open connections all day and nothing would ever notice, since a silent client
// is silent in both directions and no keep-alive loop is running yet.
//
// The bound is shortened rather than waited out, but the test still fails
// loudly — by timing out — if it is ever removed again.
func TestEnterGivesUpOnAClientThatGoesSilent(t *testing.T) {
	restore := replyDeadline
	replyDeadline = 250 * time.Millisecond
	t.Cleanup(func() { replyDeadline = restore })

	serverRaw, clientRaw := socketPair(t)
	client := &fakeClient{t: t, raw: clientRaw, conn: protocol.NewConn(clientRaw)}

	done := make(chan error, 1)
	go func() {
		_, err := Enter(context.Background(), protocol.NewConn(serverRaw), Options{
			Protocol: testProtocol,
			Name:     "SmokeTester",
			UUID:     protocol.OfflineUUID("SmokeTester"),
			Snapshot: testSnapshot(),
			Logger:   slog.New(slog.DiscardHandler),
		})
		done <- err
	}()

	client.expect(idLoginSuccess, "login success")
	// ...and now the client never acknowledges, and never closes either.

	select {
	case err := <-done:
		if err == nil {
			t.Fatal("Enter succeeded for a client that never acknowledged the login")
		}
	case <-time.After(10 * time.Second):
		t.Fatal("Enter never returned for a client that went silent after login success")
	}
}

func socketPair(t *testing.T) (server, client net.Conn) {
	t.Helper()

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	defer ln.Close()

	accepted := make(chan net.Conn, 1)
	go func() {
		c, err := ln.Accept()
		if err != nil {
			accepted <- nil
			return
		}
		accepted <- c
	}()

	client, err = net.DialTimeout("tcp", ln.Addr().String(), 5*time.Second)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	server = <-accepted
	if server == nil {
		t.Fatal("accept failed")
	}
	t.Cleanup(func() {
		_ = server.Close()
		_ = client.Close()
	})
	return server, client
}

// drainSpawn reads the four packets that put the player in the world, for tests
// that care about what comes after them.
func drainSpawn(t *testing.T, client *fakeClient) {
	t.Helper()
	prof := profiles[testProtocol]
	client.expect(prof.gameEventLoginID(), "login (play)")
	client.expect(prof.playerAbilities, "player abilities")
	client.expect(prof.gameEvent, "game event")
	client.expect(prof.syncPosition, "synchronize player position")
}

// TestEnterToleratesAPacketSentBeforeTheAcknowledgement is the fix for a way of
// dropping a player that the waiting world exists to prevent.
//
// The proxy asks the client for a stored server choice during login and stops
// waiting for the answer after a few seconds. A client on a slow link answers
// anyway, and that answer arrives in front of the login acknowledgement. Read
// strictly, it is an unexpected packet, the world fails to build, and the player
// is dropped with no message at all — for being slow.
func TestEnterToleratesAPacketSentBeforeTheAcknowledgement(t *testing.T) {
	t.Parallel()

	serverRaw, clientRaw := socketPair(t)
	client := &fakeClient{t: t, raw: clientRaw, conn: protocol.NewConn(clientRaw)}
	snap := testSnapshot()

	entered := make(chan error, 1)
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	go func() {
		s, err := Enter(ctx, protocol.NewConn(serverRaw), Options{
			Protocol: testProtocol,
			Name:     "SmokeTester",
			UUID:     protocol.OfflineUUID("SmokeTester"),
			Snapshot: snap,
			Logger:   slog.New(slog.DiscardHandler),
		})
		if s != nil {
			t.Cleanup(func() { _ = s.Close() })
		}
		entered <- err
	}()

	client.expect(idLoginSuccess, "login success")

	// A cookie response the proxy gave up waiting for, arriving late.
	client.send(protocol.NewWriter(0x04).
		String("mcproxy:target").
		Bool(false).
		Packet())
	client.send(protocol.NewWriter(idLoginAcknowledged).Packet())

	for range snap.Config {
		client.read()
	}
	client.expect(cbFinishConfiguration, "finish configuration")
	client.send(protocol.NewWriter(sbAckFinishConfiguration).Packet())

	if err := <-entered; err != nil {
		t.Fatalf("a late cookie reply cost the player their connection: %v", err)
	}
}
