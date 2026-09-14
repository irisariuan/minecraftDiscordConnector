package control

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

// TestMain silences the poller's outage logging so test output stays readable.
func TestMain(m *testing.M) {
	log.SetOutput(io.Discard)
	code := m.Run()
	log.SetOutput(os.Stderr)
	os.Exit(code)
}

const configJSON = `{
  "listenPort": 25565,
  "publicHost": "mc.example.com",
  "maxPlayers": 100,
  "motd": "§bServer Hub§r\n§7Join to start a server",
  "voteChannelConfigured": true,
  "servers": [
    {"id": 1, "tag": "Survival", "host": "127.0.0.1", "port": 25566, "online": true, "forwarding": "bungeecord", "forwardingSecret": null},
    {"id": 2, "tag": "Creative", "host": "127.0.0.1", "port": 25567, "online": false, "forwarding": "velocity", "forwardingSecret": "s3cret"}
  ]
}`

func newTestClient(srv *httptest.Server) *Client {
	return New(srv.URL, "tok", srv.Client())
}

func TestConfig(t *testing.T) {
	var gotAuth, gotContentType, gotPath, gotMethod string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		gotContentType = r.Header.Get("Content-Type")
		gotPath = r.URL.Path
		gotMethod = r.Method
		_, _ = w.Write([]byte(configJSON))
	}))
	defer srv.Close()

	cfg, err := newTestClient(srv).Config(context.Background())
	if err != nil {
		t.Fatalf("Config: %v", err)
	}

	if gotAuth != "Bearer tok" {
		t.Errorf("Authorization = %q, want %q", gotAuth, "Bearer tok")
	}
	if gotContentType != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", gotContentType)
	}
	if gotMethod != http.MethodGet || gotPath != "/config" {
		t.Errorf("request = %s %s, want GET /config", gotMethod, gotPath)
	}

	if cfg.ListenPort != 25565 || cfg.PublicHost != "mc.example.com" || cfg.MaxPlayers != 100 {
		t.Errorf("scalars decoded wrong: %+v", cfg)
	}
	if !cfg.VoteChannelConfigured {
		t.Errorf("linkTtlSeconds/voteChannelConfigured decoded wrong: %+v", cfg)
	}
	if !strings.Contains(cfg.MOTD, "\n") || !strings.Contains(cfg.MOTD, "§") {
		t.Errorf("MOTD = %q, want the legacy colour codes and newline preserved", cfg.MOTD)
	}
	if len(cfg.Servers) != 2 {
		t.Fatalf("got %d servers, want 2", len(cfg.Servers))
	}
	if s := cfg.Servers[0]; s.ID != 1 || s.Tag != "Survival" || s.Port != 25566 || !s.Online ||
		s.Forwarding != ForwardingBungeeCord || s.ForwardingSecret != "" {
		t.Errorf("server[0] = %+v", s)
	}
	if s := cfg.Servers[1]; s.Online || s.Forwarding != ForwardingVelocity || s.ForwardingSecret != "s3cret" {
		t.Errorf("server[1] = %+v", s)
	}
}

func TestConfigCloneIsDeep(t *testing.T) {
	var cfg Config
	if err := json.Unmarshal([]byte(configJSON), &cfg); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	c := cfg.Clone()
	c.Servers[0].Tag = "mutated"
	if cfg.Servers[0].Tag != "Survival" {
		t.Error("Clone shares its Servers backing array with the original")
	}
	if (*Config)(nil).Clone() != nil {
		t.Error("nil.Clone() must be nil")
	}
}

func TestUnauthorized(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":"unauthorized"}`))
	}))
	defer srv.Close()

	_, err := newTestClient(srv).Config(context.Background())
	if err == nil {
		t.Fatal("want an error for a 401")
	}
	var apiErr *APIError
	if !errors.As(err, &apiErr) {
		t.Fatalf("err = %v (%T), want an *APIError", err, err)
	}
	if apiErr.StatusCode != http.StatusUnauthorized {
		t.Errorf("StatusCode = %d, want 401", apiErr.StatusCode)
	}
	if !strings.Contains(apiErr.Error(), "401") || !strings.Contains(apiErr.Error(), "unauthorized") {
		t.Errorf("Error() = %q, want the code and body visible", apiErr.Error())
	}
}

func TestErrorBodyIsTruncated(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
		_, _ = w.Write([]byte(strings.Repeat("x", 100000)))
	}))
	defer srv.Close()

	_, err := newTestClient(srv).Config(context.Background())
	var apiErr *APIError
	if !errors.As(err, &apiErr) {
		t.Fatalf("err = %v, want an *APIError", err)
	}
	if len(apiErr.Body) > errBodyBytes+8 {
		t.Errorf("body kept %d bytes, want it capped near %d", len(apiErr.Body), errBodyBytes)
	}
}

func TestMalformedBody(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"listenPort": "not a number"`))
	}))
	defer srv.Close()

	if _, err := newTestClient(srv).Config(context.Background()); err == nil {
		t.Fatal("want an error for a malformed body")
	}
}

func TestSession(t *testing.T) {
	var got sessionRequest
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/session" {
			t.Errorf("request = %s %s, want POST /session", r.Method, r.URL.Path)
		}
		if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
			t.Errorf("decode request: %v", err)
		}
		_, _ = w.Write([]byte(`{
		  "linked": true,
		  "discordId": "123456789",
		  "voteChannelConfigured": true,
		  "servers": [
		    {"id": 1, "tag": "Survival", "online": false, "accessible": true, "canStart": true, "pollPending": false, "pollUrl": null},
		    {"id": 2, "tag": "Creative", "online": false, "accessible": true, "canStart": false, "pollPending": true, "pollUrl": "https://discord.com/x"}
		  ]
		}`))
	}))
	defer srv.Close()

	s, err := newTestClient(srv).Session(context.Background(),
		"069a79f4-44e9-4726-a5be-fca90e38aaf5", "Notch", "1.2.3.4", 767)
	if err != nil {
		t.Fatalf("Session: %v", err)
	}

	if got.UUID != "069a79f4-44e9-4726-a5be-fca90e38aaf5" || got.Name != "Notch" ||
		got.IP != "1.2.3.4" || got.Protocol != 767 {
		t.Errorf("request body = %+v", got)
	}
	if !s.Linked || s.DiscordID != "123456789" || !s.VoteChannelConfigured {
		t.Errorf("session = %+v", s)
	}
	if len(s.Servers) != 2 {
		t.Fatalf("got %d servers, want 2", len(s.Servers))
	}
	if e := s.Servers[0]; !e.Accessible || !e.CanStart || e.PollPending || e.PollURL != "" {
		t.Errorf("servers[0] = %+v", e)
	}
	if e := s.Servers[1]; e.CanStart || !e.PollPending || e.PollURL != "https://discord.com/x" {
		t.Errorf("servers[1] = %+v", e)
	}
}

func TestSessionUnlinked(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"linked": false, "voteChannelConfigured": false,
		  "servers": [{"id": 1, "tag": "Survival", "online": false, "accessible": false, "canStart": false, "pollPending": false, "pollUrl": null}]}`))
	}))
	defer srv.Close()

	s, err := newTestClient(srv).Session(context.Background(), "u", "n", "", 47)
	if err != nil {
		t.Fatalf("Session: %v", err)
	}
	if s.Linked || s.DiscordID != "" || s.Servers[0].Accessible {
		t.Errorf("unlinked session = %+v", s)
	}
}

// TestStartAllStatuses checks that every status string in CONTROL_API.md is
// passed through untouched and matches its exported constant.
func TestStartAllStatuses(t *testing.T) {
	statuses := []string{
		StatusStarted, StatusAlreadyOnline, StatusPollCreated, StatusPollPending,
		StatusNoChannel, StatusNoPermission, StatusInsufficientCredit,
		StatusPortConflict, StatusNotLinked, StatusNoAccess, StatusFailed,
	}
	wire := []string{
		"started", "already_online", "poll_created", "poll_pending",
		"no_channel", "no_permission", "insufficient_credit",
		"port_conflict", "not_linked", "no_access", "failed",
	}
	for i, want := range wire {
		if statuses[i] != want {
			t.Fatalf("constant %d = %q, want %q", i, statuses[i], want)
		}
	}

	for _, status := range statuses {
		t.Run(status, func(t *testing.T) {
			var got startRequest
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method != http.MethodPost || r.URL.Path != "/start" {
					t.Errorf("request = %s %s, want POST /start", r.Method, r.URL.Path)
				}
				if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
					t.Errorf("decode request: %v", err)
				}
				resp, _ := json.Marshal(StartResult{
					Status:  status,
					Message: "message for " + status,
					PollURL: "https://discord.com/p",
				})
				_, _ = w.Write(resp)
			}))
			defer srv.Close()

			res, err := newTestClient(srv).Start(context.Background(), "uuid", "Notch", 7)
			if err != nil {
				t.Fatalf("Start: %v", err)
			}
			if res.Status != status {
				t.Errorf("Status = %q, want %q", res.Status, status)
			}
			if res.Message != "message for "+status || res.PollURL != "https://discord.com/p" {
				t.Errorf("result = %+v", res)
			}
			if got.UUID != "uuid" || got.Name != "Notch" || got.ServerID != 7 {
				t.Errorf("request body = %+v", got)
			}
		})
	}
}

func TestContextCancelled(t *testing.T) {
	release := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-release
	}))
	defer srv.Close()
	defer close(release)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	if _, err := newTestClient(srv).Config(ctx); !errors.Is(err, context.Canceled) {
		t.Errorf("err = %v, want context.Canceled", err)
	}
}

func TestBaseURLTrailingSlash(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/config" {
			t.Errorf("path = %q, want /config", r.URL.Path)
		}
		_, _ = w.Write([]byte(configJSON))
	}))
	defer srv.Close()

	c := New(srv.URL+"/", "tok", srv.Client())
	if _, err := c.Config(context.Background()); err != nil {
		t.Fatalf("Config: %v", err)
	}
}
