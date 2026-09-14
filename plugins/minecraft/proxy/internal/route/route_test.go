package route

import (
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/control"
)

// newUnitProxy builds a Proxy for the tests that only need one to reach its
// methods. It is deliberately shared by every subtest under a given parent,
// because New generates an RSA keypair and that is by far the slowest thing in
// this file.
func newUnitProxy(t *testing.T) *Proxy {
	t.Helper()

	bot := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"listenPort":25565,"maxPlayers":100,"servers":[]}`)
	}))
	t.Cleanup(bot.Close)

	client := control.New(bot.URL, "test-token", bot.Client())
	p, err := New(Options{
		ListenAddr: "127.0.0.1:0",
		Control:    client,
		Poller:     control.NewPoller(client, control.DefaultInterval),
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
	})
	if err != nil {
		t.Fatalf("route.New: %v", err)
	}
	return p
}

func TestCleanHost(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		input string
		want  string
	}{
		{
			name:  "a plain hostname is returned untouched",
			input: "mc.example.com",
			want:  "mc.example.com",
		},
		{
			name:  "a bare label is returned untouched",
			input: "survival",
			want:  "survival",
		},
		{
			name:  "the empty host stays empty",
			input: "",
			want:  "",
		},
		{
			name:  "a Forge marker after a null is discarded",
			input: "mc.example.com\x00FML\x00",
			want:  "mc.example.com",
		},
		{
			name:  "the Forge 1.13+ marker is discarded too",
			input: "mc.example.com\x00FML2\x00",
			want:  "mc.example.com",
		},
		{
			name: "a whole BungeeCord forwarding payload appended by a previous hop is discarded",
			input: "mc.example.com\x00203.0.113.7\x00069a79f444e94726a5befca90e38aaf5\x00" +
				`[{"name":"textures","value":"dmFsdWU=","signature":"c2ln"}]`,
			want: "mc.example.com",
		},
		{
			name:  "a host that is nothing but a null becomes empty",
			input: "\x00spoofed",
			want:  "",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := cleanHost(tc.input); got != tc.want {
				t.Errorf("cleanHost(%q) = %q, want %q", tc.input, got, tc.want)
			}
		})
	}
}

// fixedAddr is a net.Addr with a chosen textual form.
type fixedAddr string

func (a fixedAddr) Network() string { return "tcp" }
func (a fixedAddr) String() string  { return string(a) }

// remoteAddrConn overrides only RemoteAddr, which is all clientIP reads.
type remoteAddrConn struct {
	net.Conn
	remote net.Addr
}

func (c remoteAddrConn) RemoteAddr() net.Addr { return c.remote }

func TestClientIP(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		remote string
		want   string
	}{
		{
			name:   "an IPv4 address loses its port",
			remote: "203.0.113.7:51234",
			want:   "203.0.113.7",
		},
		{
			name:   "an IPv6 address loses its port and its brackets",
			remote: "[2001:db8::1]:51234",
			want:   "2001:db8::1",
		},
		{
			name:   "IPv6 loopback is handled like any other address",
			remote: "[::1]:25565",
			want:   "::1",
		},
		{
			name:   "an address with no port at all is passed through unchanged",
			remote: "203.0.113.7",
			want:   "203.0.113.7",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			serverSide, clientSide := net.Pipe()
			t.Cleanup(func() {
				_ = serverSide.Close()
				_ = clientSide.Close()
			})

			conn := remoteAddrConn{Conn: serverSide, remote: fixedAddr(tc.remote)}
			if got := clientIP(conn); got != tc.want {
				t.Errorf("clientIP(remote=%q) = %q, want %q", tc.remote, got, tc.want)
			}
		})
	}
}

func TestSlugify(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		input string
		want  string
	}{
		{name: "an already-clean tag is unchanged", input: "survival", want: "survival"},
		{name: "capitals are lowered", input: "Survival", want: "survival"},
		{name: "spaces become hyphens", input: "Creative World", want: "creative-world"},
		{name: "underscores become hyphens", input: "creative_world", want: "creative-world"},
		{name: "an existing hyphen is kept", input: "creative-world", want: "creative-world"},
		{name: "digits are kept", input: "Season 3", want: "season-3"},
		{name: "punctuation is dropped", input: "Notch's Server!", want: "notchs-server"},
		{name: "surrounding whitespace is trimmed before anything else", input: "  Survival  ", want: "survival"},
		{name: "a tag of nothing but punctuation reduces to the empty string", input: "!!!", want: ""},
		{name: "an empty tag reduces to the empty string", input: "", want: ""},
		{name: "whitespace only reduces to the empty string", input: "   ", want: ""},
		{name: "non-ASCII letters are dropped", input: "日本 Server", want: "-server"},
		{name: "internal runs of spaces each become a hyphen", input: "a  b", want: "a--b"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := slugify(tc.input); got != tc.want {
				t.Errorf("slugify(%q) = %q, want %q", tc.input, got, tc.want)
			}
		})
	}
}

// selectionServers is the server list the forced-host and selection tests share.
func selectionServers() []control.SessionServerInfo {
	return []control.SessionServerInfo{
		{ID: 1, Tag: "Survival", Online: true, Accessible: true},
		{ID: 2, Tag: "Creative World", Online: false, Accessible: true},
		{ID: 7, Tag: "Staff Only", Online: true, Accessible: false},
	}
}

func TestForcedHost(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		host   string
		wantID int
		wantOK bool
	}{
		{
			name:   "a bare label matches a server tag",
			host:   "survival",
			wantID: 1,
			wantOK: true,
		},
		{
			name:   "the first label of a full hostname matches",
			host:   "survival.example.com",
			wantID: 1,
			wantOK: true,
		},
		{
			name:   "a slugified multi-word tag matches",
			host:   "creative-world.example.com",
			wantID: 2,
			wantOK: true,
		},
		{
			name:   "matching is case-insensitive on both sides",
			host:   "SURVIVAL.Example.COM",
			wantID: 1,
			wantOK: true,
		},
		{
			name:   "surrounding whitespace is ignored",
			host:   "  survival  ",
			wantID: 1,
			wantOK: true,
		},
		{
			name:   "a hostname matching nothing selects nothing",
			host:   "mc.example.com",
			wantID: 0,
			wantOK: false,
		},
		{
			name:   "an empty hostname selects nothing",
			host:   "",
			wantID: 0,
			wantOK: false,
		},
		{
			name:   "a hostname that is only a dot selects nothing",
			host:   ".example.com",
			wantID: 0,
			wantOK: false,
		},
		{
			name:   "a server the player cannot access is never selected",
			host:   "staff-only.example.com",
			wantID: 0,
			wantOK: false,
		},
		{
			name:   "the unslugified tag does not match",
			host:   "creative world",
			wantID: 0,
			wantOK: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			gotID, gotOK := forcedHost(tc.host, selectionServers())
			if gotID != tc.wantID || gotOK != tc.wantOK {
				t.Errorf("forcedHost(%q) = (%d, %t), want (%d, %t)",
					tc.host, gotID, gotOK, tc.wantID, tc.wantOK)
			}
		})
	}
}

func TestAccessibleIDs(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		servers    []control.SessionServerInfo
		wantAll    []int
		wantOnline []int
	}{
		{
			name: "output is sorted by id regardless of the order the bot sent",
			servers: []control.SessionServerInfo{
				{ID: 9, Accessible: true, Online: true},
				{ID: 2, Accessible: true, Online: true},
				{ID: 5, Accessible: true, Online: true},
			},
			wantAll:    []int{2, 5, 9},
			wantOnline: []int{2, 5, 9},
		},
		{
			name: "inaccessible servers are filtered out of both lists",
			servers: []control.SessionServerInfo{
				{ID: 1, Accessible: false, Online: true},
				{ID: 2, Accessible: true, Online: true},
				{ID: 3, Accessible: false, Online: false},
			},
			wantAll:    []int{2},
			wantOnline: []int{2},
		},
		{
			name: "offline servers are accessible but not online",
			servers: []control.SessionServerInfo{
				{ID: 1, Accessible: true, Online: false},
				{ID: 2, Accessible: true, Online: true},
				{ID: 3, Accessible: true, Online: false},
			},
			wantAll:    []int{1, 2, 3},
			wantOnline: []int{2},
		},
		{
			name: "nothing accessible yields empty lists",
			servers: []control.SessionServerInfo{
				{ID: 1, Accessible: false, Online: true},
			},
			wantAll:    nil,
			wantOnline: nil,
		},
		{
			name:       "no servers at all yields empty lists",
			servers:    nil,
			wantAll:    nil,
			wantOnline: nil,
		},
		{
			name: "everything accessible but nothing running yields an empty online list",
			servers: []control.SessionServerInfo{
				{ID: 4, Accessible: true, Online: false},
				{ID: 1, Accessible: true, Online: false},
			},
			wantAll:    []int{1, 4},
			wantOnline: nil,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			sess := &control.Session{Linked: true, Servers: tc.servers}
			assertIDs(t, "accessibleIDs", accessibleIDs(sess), tc.wantAll)
			assertIDs(t, "onlineAccessibleIDs", onlineAccessibleIDs(sess), tc.wantOnline)
		})
	}
}

func assertIDs(t *testing.T, what string, got, want []int) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("%s = %v, want %v", what, got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("%s = %v, want %v", what, got, want)
		}
	}
}

func TestChooseTarget(t *testing.T) {
	t.Parallel()

	// One Proxy for every subtest: New generates an RSA keypair, and
	// chooseTarget reads nothing from the receiver, so sharing is safe.
	p := newUnitProxy(t)

	tests := []struct {
		name       string
		host       string
		servers    []control.SessionServerInfo
		wantID     int
		wantOnline bool
	}{
		{
			name: "a forced host wins over a server that is already online",
			host: "creative",
			servers: []control.SessionServerInfo{
				{ID: 1, Tag: "Survival", Accessible: true, Online: true},
				{ID: 2, Tag: "Creative", Accessible: true, Online: true},
			},
			wantID:     2,
			wantOnline: true,
		},
		{
			name: "a forced host naming an offline server is still chosen, and reported offline",
			host: "survival.example.com",
			servers: []control.SessionServerInfo{
				{ID: 1, Tag: "Survival", Accessible: true, Online: false},
				{ID: 2, Tag: "Creative", Accessible: true, Online: true},
			},
			wantID:     1,
			wantOnline: false,
		},
		{
			name: "a forced host naming an inaccessible server falls through to the normal rules",
			host: "staff-only.example.com",
			servers: []control.SessionServerInfo{
				{ID: 1, Tag: "Staff Only", Accessible: false, Online: true},
				{ID: 2, Tag: "Creative", Accessible: true, Online: true},
			},
			wantID:     2,
			wantOnline: true,
		},
		{
			name: "with no forced host an online server is preferred over an offline one",
			host: "mc.example.com",
			servers: []control.SessionServerInfo{
				{ID: 1, Tag: "Survival", Accessible: true, Online: false},
				{ID: 2, Tag: "Creative", Accessible: true, Online: true},
			},
			wantID:     2,
			wantOnline: true,
		},
		{
			name: "the lowest id breaks a tie between online servers",
			host: "mc.example.com",
			servers: []control.SessionServerInfo{
				{ID: 9, Tag: "Nine", Accessible: true, Online: true},
				{ID: 2, Tag: "Two", Accessible: true, Online: true},
				{ID: 5, Tag: "Five", Accessible: true, Online: true},
			},
			wantID:     2,
			wantOnline: true,
		},
		{
			name: "with nothing running it falls back to an accessible server and says it is offline",
			host: "mc.example.com",
			servers: []control.SessionServerInfo{
				{ID: 7, Tag: "Seven", Accessible: true, Online: false},
				{ID: 3, Tag: "Three", Accessible: true, Online: false},
			},
			wantID:     3,
			wantOnline: false,
		},
		{
			name: "an inaccessible online server is never chosen",
			host: "mc.example.com",
			servers: []control.SessionServerInfo{
				{ID: 1, Tag: "Staff", Accessible: false, Online: true},
				{ID: 4, Tag: "Survival", Accessible: true, Online: false},
			},
			wantID:     4,
			wantOnline: false,
		},
		{
			name: "an empty host behaves as no forced host",
			host: "",
			servers: []control.SessionServerInfo{
				{ID: 1, Tag: "Survival", Accessible: true, Online: false},
				{ID: 2, Tag: "Creative", Accessible: true, Online: true},
			},
			wantID:     2,
			wantOnline: true,
		},
		{
			name: "a single accessible offline server is chosen with online false",
			host: "mc.example.com",
			servers: []control.SessionServerInfo{
				{ID: 1, Tag: "Survival", Accessible: true, Online: false},
			},
			wantID:     1,
			wantOnline: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			sess := &control.Session{Linked: true, Servers: tc.servers}
			gotID, gotOnline := p.chooseTarget(sess, tc.host)
			if gotID != tc.wantID || gotOnline != tc.wantOnline {
				t.Errorf("chooseTarget(host=%q) = (%d, online=%t), want (%d, online=%t)",
					tc.host, gotID, gotOnline, tc.wantID, tc.wantOnline)
			}
		})
	}
}

func TestChooseTargetUsesTheCleanedHost(t *testing.T) {
	t.Parallel()

	// handleLogin passes cleanHost(hs.Host), so a Forge marker or a stale
	// forwarding payload must not stop a forced host from matching.
	p := newUnitProxy(t)
	sess := &control.Session{
		Linked: true,
		Servers: []control.SessionServerInfo{
			{ID: 1, Tag: "Survival", Accessible: true, Online: false},
			{ID: 2, Tag: "Creative", Accessible: true, Online: true},
		},
	}

	gotID, gotOnline := p.chooseTarget(sess, cleanHost("survival.example.com\x00FML\x00"))
	if gotID != 1 || gotOnline {
		t.Errorf("chooseTarget after cleanHost = (%d, online=%t), want (1, online=false)", gotID, gotOnline)
	}
}
