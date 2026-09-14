package route

import (
	"testing"

	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/control"
	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/limbo"
	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/mcver"
)

func TestDecide(t *testing.T) {
	t.Parallel()

	const modern = mcver.V1_20_5
	const old = mcver.V1_16 // holdable, but no waiting world

	srv := func(id int, tag string, online bool) control.SessionServerInfo {
		return control.SessionServerInfo{ID: id, Tag: tag, Online: online, Accessible: true}
	}

	cases := []struct {
		name     string
		servers  []control.SessionServerInfo
		host     string
		protocol int32
		chosen   int
		wantPlan plan
		wantSrv  int
	}{
		{
			name:     "one server, running: straight there, no world in the way",
			servers:  []control.SessionServerInfo{srv(1, "Survival", true)},
			protocol: modern,
			wantPlan: planJoin, wantSrv: 1,
		},
		{
			name:     "one server, stopped: the world can at least explain",
			servers:  []control.SessionServerInfo{srv(1, "Survival", false)},
			protocol: modern,
			wantPlan: planWorld,
		},
		{
			name:     "two servers, one running: there is still a choice",
			servers:  []control.SessionServerInfo{srv(1, "Survival", true), srv(2, "Creative", false)},
			protocol: modern,
			wantPlan: planWorld,
		},
		{
			name:     "two servers running: definitely a choice",
			servers:  []control.SessionServerInfo{srv(1, "Survival", true), srv(2, "Creative", true)},
			protocol: modern,
			wantPlan: planWorld,
		},
		{
			name:     "a hostname is a choice already made",
			servers:  []control.SessionServerInfo{srv(1, "Survival", true), srv(2, "Creative", true)},
			host:     "creative.example.com",
			protocol: modern,
			wantPlan: planJoin, wantSrv: 2,
		},
		{
			name:     "a hostname naming a stopped server holds rather than asking again",
			servers:  []control.SessionServerInfo{srv(1, "Survival", true), srv(2, "Creative", false)},
			host:     "creative.example.com",
			protocol: modern,
			wantPlan: planHold, wantSrv: 2,
		},
		{
			name:     "a cookie from the waiting world is honoured",
			servers:  []control.SessionServerInfo{srv(1, "Survival", true), srv(2, "Creative", true)},
			protocol: modern,
			chosen:   2,
			wantPlan: planJoin, wantSrv: 2,
		},
		{
			name:     "a cookie for a server that is not up yet holds, and does not loop back to the world",
			servers:  []control.SessionServerInfo{srv(1, "Survival", true), srv(2, "Creative", false)},
			protocol: modern,
			chosen:   2,
			wantPlan: planHold, wantSrv: 2,
		},
		{
			name:     "a client too old for the world falls back to the old precedence",
			servers:  []control.SessionServerInfo{srv(1, "Survival", false), srv(2, "Creative", true)},
			protocol: old,
			wantPlan: planJoin, wantSrv: 2,
		},
		{
			name:     "a client too old for the world, with nothing up, is held",
			servers:  []control.SessionServerInfo{srv(1, "Survival", false), srv(2, "Creative", false)},
			protocol: old,
			wantPlan: planHold, wantSrv: 1,
		},
		{
			name:     "a client too old even to hold is told why",
			servers:  []control.SessionServerInfo{srv(1, "Survival", false)},
			protocol: mcver.V1_8,
			wantPlan: planRefuse,
		},
		{
			name:     "no servers at all",
			servers:  nil,
			protocol: modern,
			wantPlan: planRefuse,
		},
		{
			name:     "servers exist but none for this player",
			servers:  []control.SessionServerInfo{{ID: 1, Tag: "Private", Online: true}},
			protocol: modern,
			wantPlan: planRefuse,
		},
	}

	p := proxyWithWorldFor(modern)
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got := p.decide(&control.Session{Servers: tc.servers}, tc.host, tc.protocol, tc.chosen)
			if got.Plan != tc.wantPlan {
				t.Fatalf("plan = %s (%s), want %s", got.Plan, got.Reason, tc.wantPlan)
			}
			if tc.wantSrv != 0 && got.Server != tc.wantSrv {
				t.Errorf("server = %d, want %d (%s)", got.Server, tc.wantSrv, got.Reason)
			}
			if got.Plan == planRefuse && got.Message == "" {
				t.Error("a refusal must carry something to show the player")
			}
			if got.Reason == "" {
				t.Error("every decision needs a reason for the log")
			}
		})
	}
}

// A cookie is stored on the client, so it is a claim rather than a fact. The
// access decision has to come from the bot's answer for this login.
func TestDecideIgnoresACookieNamingAServerThePlayerMayNotUse(t *testing.T) {
	t.Parallel()

	sess := &control.Session{Servers: []control.SessionServerInfo{
		{ID: 1, Tag: "Survival", Online: true, Accessible: true},
		{ID: 9, Tag: "Staff", Online: true},
	}}

	got := proxyWithWorldFor(mcver.V1_20_5).decide(sess, "", mcver.V1_20_5, 9)
	if got.Server == 9 {
		t.Fatalf("decision = %+v, want the forged choice ignored", got)
	}
	if got.Plan != planJoin || got.Server != 1 {
		t.Fatalf("decision = %+v, want a join to the one server they may use", got)
	}
}

// proxyWithWorldFor builds a Proxy that can offer the waiting world to one
// protocol version, which is what having recorded a snapshot for it amounts to.
func proxyWithWorldFor(protocolVersion int32) *Proxy {
	store := limbo.NewMemoryStore()
	_ = store.Put(&limbo.Snapshot{Protocol: protocolVersion})
	return &Proxy{opts: Options{Snapshots: store}}
}
