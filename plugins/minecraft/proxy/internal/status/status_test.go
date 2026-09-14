package status

import (
	"bytes"
	"encoding/json"
	"math"
	"net"
	"strings"
	"testing"
	"time"

	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/protocol"
)

// pipeTimeout bounds every connection-driven test in this package. Nothing here
// should take longer than a few microseconds, so reaching this means the
// exchange deadlocked and the test must fail rather than hang the suite.
const pipeTimeout = 10 * time.Second

// payloadShape is the status response as a client parses it.
type payloadShape struct {
	Version struct {
		Name     string `json:"name"`
		Protocol int32  `json:"protocol"`
	} `json:"version"`
	Players struct {
		Max    int               `json:"max"`
		Online int               `json:"online"`
		Sample []json.RawMessage `json:"sample"`
	} `json:"players"`
	Description        json.RawMessage `json:"description"`
	EnforcesSecureChat bool            `json:"enforcesSecureChat"`
}

func decodePayload(t *testing.T, raw []byte) payloadShape {
	t.Helper()
	if !json.Valid(raw) {
		t.Fatalf("status payload is not valid JSON: %s", raw)
	}
	var got payloadShape
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatalf("status payload %s does not unmarshal: %v", raw, err)
	}
	return got
}

func TestPayload(t *testing.T) {
	t.Parallel()

	info := Info{
		MOTD:           "§bServer Hub§r\n§7Join to start a server",
		MaxPlayers:     73,
		OnlinePlayers:  4,
		VersionName:    "mcproxy",
		ClientProtocol: 767,
	}

	raw, err := Payload(info)
	if err != nil {
		t.Fatalf("Payload: %v", err)
	}
	got := decodePayload(t, raw)

	if got.Version.Name != "mcproxy" {
		t.Errorf("version.name = %q, want %q", got.Version.Name, "mcproxy")
	}
	if got.Version.Protocol != 767 {
		t.Errorf("version.protocol = %d, want the client's own 767", got.Version.Protocol)
	}
	if got.Players.Max != 73 {
		t.Errorf("players.max = %d, want 73", got.Players.Max)
	}
	if got.Players.Online != 4 {
		t.Errorf("players.online = %d, want 4", got.Players.Online)
	}
	if got.EnforcesSecureChat {
		t.Error("enforcesSecureChat = true, want false: the proxy never asks for a chat-signing key")
	}

	wantDescription := string(LegacyToComponentJSON(info.MOTD))
	if string(got.Description) != wantDescription {
		t.Errorf("description = %s, want %s", got.Description, wantDescription)
	}
}

func TestPayloadEchoesTheClientProtocol(t *testing.T) {
	t.Parallel()

	// Every protocol the proxy will ever be pinged by must come back verbatim,
	// or the client renders the entry as incompatible and greys it out.
	for _, proto := range []int32{4, 47, 393, 759, 767, 1073741} {
		raw, err := Payload(Info{ClientProtocol: proto})
		if err != nil {
			t.Fatalf("Payload(protocol=%d): %v", proto, err)
		}
		if got := decodePayload(t, raw).Version.Protocol; got != proto {
			t.Errorf("version.protocol = %d, want the client's own %d", got, proto)
		}
	}
}

func TestPayloadDefaultsVersionName(t *testing.T) {
	t.Parallel()

	raw, err := Payload(Info{VersionName: "", ClientProtocol: 767})
	if err != nil {
		t.Fatalf("Payload: %v", err)
	}
	if got := decodePayload(t, raw).Version.Name; got != "Proxy" {
		t.Errorf("version.name = %q, want the default %q", got, "Proxy")
	}
}

func TestPayloadSampleIsAnEmptyArrayNotNull(t *testing.T) {
	t.Parallel()

	raw, err := Payload(Info{MaxPlayers: 10, OnlinePlayers: 0, ClientProtocol: 767})
	if err != nil {
		t.Fatalf("Payload: %v", err)
	}
	if !bytes.Contains(raw, []byte(`"sample":[]`)) {
		t.Errorf("payload %s does not carry \"sample\":[]; a null sample breaks older clients", raw)
	}
	got := decodePayload(t, raw)
	if got.Players.Sample == nil {
		t.Error("players.sample decoded as null, want an empty array")
	}
	if len(got.Players.Sample) != 0 {
		t.Errorf("players.sample has %d entries, want 0", len(got.Players.Sample))
	}
}

// serveHarness runs Serve on one end of an in-memory pipe and hands the test
// the client end of it.
type serveHarness struct {
	client *protocol.Conn
	raw    net.Conn
	done   chan error
}

func startServe(t *testing.T, info Info) *serveHarness {
	t.Helper()

	serverSide, clientSide := net.Pipe()
	// A deadline on the pipe is the backstop: a test that would otherwise block
	// forever fails with a timeout instead.
	deadline := time.Now().Add(pipeTimeout)
	_ = serverSide.SetDeadline(deadline)
	_ = clientSide.SetDeadline(deadline)
	t.Cleanup(func() {
		_ = serverSide.Close()
		_ = clientSide.Close()
	})

	h := &serveHarness{
		client: protocol.NewConn(clientSide),
		raw:    clientSide,
		done:   make(chan error, 1),
	}
	go func() { h.done <- Serve(protocol.NewConn(serverSide), info) }()
	return h
}

// wait returns Serve's result, failing the test if it never returns.
func (h *serveHarness) wait(t *testing.T) error {
	t.Helper()
	select {
	case err := <-h.done:
		return err
	case <-time.After(pipeTimeout):
		t.Fatal("Serve never returned: the status exchange deadlocked")
		return nil
	}
}

func testInfo() Info {
	return Info{
		MOTD:           "§bServer Hub§r\n§7Join to start a server",
		MaxPlayers:     100,
		OnlinePlayers:  2,
		VersionName:    "Proxy",
		ClientProtocol: 767,
	}
}

func TestServeStatusRequestThenPing(t *testing.T) {
	t.Parallel()

	info := testInfo()
	h := startServe(t, info)

	if err := h.client.WritePacket(protocol.NewWriter(idStatusRequest).Packet()); err != nil {
		t.Fatalf("send status request: %v", err)
	}

	pkt, err := h.client.ReadPacket()
	if err != nil {
		t.Fatalf("read status response: %v", err)
	}
	if pkt.ID != idStatusResponse {
		t.Fatalf("status response has id 0x%02x, want 0x%02x", pkt.ID, idStatusResponse)
	}
	body, err := protocol.NewReader(pkt.Data).String(0)
	if err != nil {
		t.Fatalf("status response body is not a string field: %v", err)
	}
	want, err := Payload(info)
	if err != nil {
		t.Fatalf("Payload: %v", err)
	}
	if body != string(want) {
		t.Errorf("status response body = %s, want %s", body, want)
	}

	const nonce int64 = 0x0123456789abcdef
	if err := h.client.WritePacket(protocol.NewWriter(idPingRequest).Long(nonce).Packet()); err != nil {
		t.Fatalf("send ping: %v", err)
	}
	assertPong(t, h.client, nonce)

	if err := h.wait(t); err != nil {
		t.Errorf("Serve returned %v, want nil after a completed status exchange", err)
	}
}

func TestServePingWithoutStatusRequest(t *testing.T) {
	t.Parallel()

	// Some clients, and every latency checker, ping without asking for the
	// status first. That must still be answered.
	h := startServe(t, testInfo())

	const nonce int64 = 987654321
	if err := h.client.WritePacket(protocol.NewWriter(idPingRequest).Long(nonce).Packet()); err != nil {
		t.Fatalf("send ping: %v", err)
	}
	assertPong(t, h.client, nonce)

	if err := h.wait(t); err != nil {
		t.Errorf("Serve returned %v, want nil after answering a bare ping", err)
	}
}

func TestServeEchoesTheNonceExactly(t *testing.T) {
	t.Parallel()

	nonces := []struct {
		name  string
		value int64
	}{
		{"zero", 0},
		{"positive", 1},
		{"a client's millisecond timestamp", 1726300000000},
		{"negative", -1},
		{"the most negative int64", math.MinInt64},
		{"the most positive int64", math.MaxInt64},
	}

	for _, tc := range nonces {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			h := startServe(t, testInfo())
			if err := h.client.WritePacket(protocol.NewWriter(idPingRequest).Long(tc.value).Packet()); err != nil {
				t.Fatalf("send ping: %v", err)
			}
			assertPong(t, h.client, tc.value)
			if err := h.wait(t); err != nil {
				t.Errorf("Serve returned %v, want nil", err)
			}
		})
	}
}

// assertPong reads one packet and checks it is a pong echoing want.
func assertPong(t *testing.T, conn *protocol.Conn, want int64) {
	t.Helper()

	pkt, err := conn.ReadPacket()
	if err != nil {
		t.Fatalf("read pong: %v", err)
	}
	if pkt.ID != idPongResponse {
		t.Fatalf("pong has id 0x%02x, want 0x%02x", pkt.ID, idPongResponse)
	}
	got, err := protocol.NewReader(pkt.Data).Long()
	if err != nil {
		t.Fatalf("pong payload is not a long: %v", err)
	}
	if got != want {
		t.Errorf("pong nonce = %d, want the client's own %d", got, want)
	}
}

func TestServeCleanEndOfStreamIsNotAnError(t *testing.T) {
	t.Parallel()

	t.Run("client closes before sending anything", func(t *testing.T) {
		t.Parallel()

		h := startServe(t, testInfo())
		if err := h.raw.Close(); err != nil {
			t.Fatalf("close client: %v", err)
		}
		if err := h.wait(t); err != nil {
			t.Errorf("Serve returned %v, want nil: a clean disconnect is not a failure", err)
		}
	})

	t.Run("client closes after reading the status response", func(t *testing.T) {
		t.Parallel()

		// This is what the vanilla multiplayer list does when it refreshes an
		// entry it is not measuring latency for.
		h := startServe(t, testInfo())
		if err := h.client.WritePacket(protocol.NewWriter(idStatusRequest).Packet()); err != nil {
			t.Fatalf("send status request: %v", err)
		}
		if _, err := h.client.ReadPacket(); err != nil {
			t.Fatalf("read status response: %v", err)
		}
		if err := h.raw.Close(); err != nil {
			t.Fatalf("close client: %v", err)
		}
		if err := h.wait(t); err != nil {
			t.Errorf("Serve returned %v, want nil after the client hung up", err)
		}
	})
}

func TestServeRejectsAnUnexpectedPacketID(t *testing.T) {
	t.Parallel()

	h := startServe(t, testInfo())
	if err := h.client.WritePacket(protocol.NewWriter(0x42).Packet()); err != nil {
		t.Fatalf("send bogus packet: %v", err)
	}

	err := h.wait(t)
	if err == nil {
		t.Fatal("Serve returned nil for packet 0x42 in the status state, want an error")
	}
	if !strings.Contains(err.Error(), "0x42") {
		t.Errorf("Serve error %q does not name the offending packet id 0x42", err)
	}
}

func TestServeAnswersARepeatedStatusRequest(t *testing.T) {
	t.Parallel()

	// A status request does not end the exchange; only a ping or a disconnect
	// does. Answering a second one keeps a chatty client working.
	info := testInfo()
	h := startServe(t, info)

	for i := 0; i < 2; i++ {
		if err := h.client.WritePacket(protocol.NewWriter(idStatusRequest).Packet()); err != nil {
			t.Fatalf("send status request %d: %v", i, err)
		}
		pkt, err := h.client.ReadPacket()
		if err != nil {
			t.Fatalf("read status response %d: %v", i, err)
		}
		if pkt.ID != idStatusResponse {
			t.Fatalf("status response %d has id 0x%02x, want 0x%02x", i, pkt.ID, idStatusResponse)
		}
	}

	if err := h.client.WritePacket(protocol.NewWriter(idPingRequest).Long(7).Packet()); err != nil {
		t.Fatalf("send ping: %v", err)
	}
	assertPong(t, h.client, 7)
	if err := h.wait(t); err != nil {
		t.Errorf("Serve returned %v, want nil", err)
	}
}
