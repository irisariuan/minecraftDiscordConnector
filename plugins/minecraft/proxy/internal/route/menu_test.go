package route

import (
	"strings"
	"testing"

	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/control"
)

func sessionWith(servers ...control.SessionServerInfo) *control.Session {
	return &control.Session{Linked: true, Servers: servers}
}

func TestBuildMenuPutsRunningServersFirstThenSortsByName(t *testing.T) {
	t.Parallel()

	sess := sessionWith(
		control.SessionServerInfo{ID: 3, Tag: "Zebra", Accessible: true},
		control.SessionServerInfo{ID: 1, Tag: "Alpha", Accessible: true},
		control.SessionServerInfo{ID: 2, Tag: "Mirror", Accessible: true, Online: true},
		control.SessionServerInfo{ID: 4, Tag: "Hidden"},
	)

	got := buildMenu(sess)

	var tags []string
	for _, e := range got {
		tags = append(tags, e.Tag)
	}
	want := []string{"Mirror", "Alpha", "Zebra"}
	if len(tags) != len(want) {
		t.Fatalf("menu = %v, want %v", tags, want)
	}
	for i := range want {
		if tags[i] != want[i] {
			t.Fatalf("menu = %v, want %v", tags, want)
		}
	}
}

// A server nobody may use must not be advertised: naming it only invites a
// player to type something that will be refused.
func TestBuildMenuOmitsInaccessibleServers(t *testing.T) {
	t.Parallel()

	got := buildMenu(sessionWith(control.SessionServerInfo{ID: 1, Tag: "Private"}))
	if len(got) != 0 {
		t.Fatalf("menu = %+v, want nothing", got)
	}
}

func TestMenuLineSaysWhatTypingTheNameWouldDo(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name  string
		entry menuEntry
		want  string
	}{
		{"running", menuEntry{Tag: "Survival", Slug: "survival", Online: true}, "join now"},
		{"startable", menuEntry{Tag: "Survival", Slug: "survival", CanStart: true}, "you can start it"},
		{"vote open", menuEntry{Tag: "Survival", Slug: "survival", PollPending: true}, "vote is already open"},
		{"needs a vote", menuEntry{Tag: "Survival", Slug: "survival"}, "ask for a vote"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := tc.entry.line()
			if !strings.Contains(got, tc.want) {
				t.Errorf("line = %q, want it to mention %q", got, tc.want)
			}
			if !strings.Contains(got, "Survival") {
				t.Errorf("line = %q, want it to name the server", got)
			}
		})
	}
}

// A tag written entirely in characters a hostname cannot carry still has to be
// selectable, or the player is shown a server they cannot ask for.
func TestNameForFallsBackToTheIDWhenATagSlugifiesToNothing(t *testing.T) {
	t.Parallel()

	e := menuEntry{ID: 7, Tag: "生存", Slug: slugify("生存")}
	if got := e.nameFor(); got != "7" {
		t.Errorf("nameFor = %q, want %q", got, "7")
	}
}

func TestParseCommand(t *testing.T) {
	t.Parallel()

	cases := []struct {
		line       string
		wantIntent intent
		wantArg    string
	}{
		{"join survival", intentJoin, "survival"},
		{"/join survival", intentJoin, "survival"},
		{"  /join   survival  ", intentJoin, "survival"},
		{"server Creative", intentJoin, "Creative"},
		{"connect 3", intentJoin, "3"},
		{"JOIN Survival", intentJoin, "Survival"},
		// A bare verb is a request to be shown the choices, not an error.
		{"join", intentList, ""},
		{"servers", intentList, ""},
		{"list", intentList, ""},
		{"help", intentHelp, ""},
		{"", intentHelp, ""},
		{"link", intentLink, ""},
		{"tp @a", intentUnknown, ""},
	}
	for _, tc := range cases {
		t.Run(tc.line, func(t *testing.T) {
			t.Parallel()
			got := parseCommand(tc.line)
			if got.Intent != tc.wantIntent {
				t.Errorf("parseCommand(%q).Intent = %v, want %v", tc.line, got.Intent, tc.wantIntent)
			}
			if got.Arg != tc.wantArg {
				t.Errorf("parseCommand(%q).Arg = %q, want %q", tc.line, got.Arg, tc.wantArg)
			}
		})
	}
}

func TestResolve(t *testing.T) {
	t.Parallel()

	entries := []menuEntry{
		{ID: 1, Tag: "Survival", Slug: "survival"},
		{ID: 2, Tag: "Survival Hardcore", Slug: "survival-hardcore"},
		{ID: 3, Tag: "Creative", Slug: "creative"},
	}

	t.Run("an exact tag wins over a prefix it shares", func(t *testing.T) {
		t.Parallel()
		got, err := resolve(entries, "Survival")
		if err != nil || got.ID != 1 {
			t.Fatalf("resolve = %+v, %v; want the exact match, id 1", got, err)
		}
	})

	t.Run("case does not matter", func(t *testing.T) {
		t.Parallel()
		got, err := resolve(entries, "cREAtive")
		if err != nil || got.ID != 3 {
			t.Fatalf("resolve = %+v, %v; want id 3", got, err)
		}
	})

	t.Run("an id resolves", func(t *testing.T) {
		t.Parallel()
		got, err := resolve(entries, "2")
		if err != nil || got.ID != 2 {
			t.Fatalf("resolve = %+v, %v; want id 2", got, err)
		}
	})

	t.Run("an unambiguous prefix resolves", func(t *testing.T) {
		t.Parallel()
		got, err := resolve(entries, "cre")
		if err != nil || got.ID != 3 {
			t.Fatalf("resolve = %+v, %v; want id 3", got, err)
		}
	})

	t.Run("an ambiguous prefix names the candidates", func(t *testing.T) {
		t.Parallel()
		_, err := resolve(entries, "surv")
		if err == nil {
			t.Fatal("resolve accepted an ambiguous prefix")
		}
		for _, want := range []string{"survival", "survival-hardcore"} {
			if !strings.Contains(err.Error(), want) {
				t.Errorf("error %q does not offer %q", err, want)
			}
		}
	})

	t.Run("an unknown name says so", func(t *testing.T) {
		t.Parallel()
		if _, err := resolve(entries, "skyblock"); err == nil {
			t.Fatal("resolve accepted a name that is not there")
		}
	})

	t.Run("an empty argument is refused", func(t *testing.T) {
		t.Parallel()
		if _, err := resolve(entries, "   "); err == nil {
			t.Fatal("resolve accepted an empty name")
		}
	})
}

// The bot owns the wording for anything involving permission, price or votes.
// The proxy must pass that through rather than inventing its own version.
func TestStartReplyPrefersTheBotsOwnWording(t *testing.T) {
	t.Parallel()

	got := startReply(&control.StartResult{
		Status:  control.StatusPollCreated,
		Message: "Vote posted. 3 of 5 needed.",
		PollURL: "https://discord.com/x",
	})
	if !strings.Contains(got, "Vote posted. 3 of 5 needed.") {
		t.Errorf("reply = %q, want the bot's message", got)
	}
	if !strings.Contains(got, "https://discord.com/x") {
		t.Errorf("reply = %q, want the poll link", got)
	}
}

func TestStartReplyAlwaysSaysSomething(t *testing.T) {
	t.Parallel()

	for _, st := range []string{
		control.StatusStarted, control.StatusAlreadyOnline, control.StatusPollCreated,
		control.StatusPollPending, control.StatusNoChannel, control.StatusNotLinked,
		control.StatusNoPermission, control.StatusInsufficientCredit, control.StatusPortConflict,
		control.StatusNoAccess, control.StatusFailed, "something invented later",
	} {
		got := startReply(&control.StartResult{Status: st})
		if strings.TrimSpace(strings.TrimLeft(got, "§acew")) == "" {
			t.Errorf("status %q produced an empty line %q", st, got)
		}
	}
}

func TestStartKeepsWaitingOnlyWhileSomethingMayStillHappen(t *testing.T) {
	t.Parallel()

	waits := map[string]bool{
		control.StatusStarted:                true,
		control.StatusAlreadyOnline:          true,
		control.StatusPollCreated:            true,
		control.StatusPollPending:            true,
		control.StatusNoChannel:              false,
		control.StatusNoPermission:           false,
		control.StatusInsufficientCredit:     false,
		control.StatusPortConflict:           false,
		control.StatusNotLinked:              false,
		control.StatusNoAccess:               false,
		control.StatusFailed:                 false,
		"a status invented after we shipped": false,
	}
	for st, want := range waits {
		if got := startKeepsWaiting(st); got != want {
			t.Errorf("startKeepsWaiting(%q) = %v, want %v", st, got, want)
		}
	}
}
