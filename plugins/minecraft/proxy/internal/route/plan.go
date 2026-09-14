package route

import (
	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/control"
	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/mcver"
)

// plan is what the proxy has decided to do with a player, once it knows who
// they are and what they may use.
type plan int

const (
	// planJoin sends them straight to a running backend.
	planJoin plan = iota
	// planWorld puts them in the waiting world to choose for themselves.
	planWorld
	// planHold parks them mid-login until their one destination comes up. It is
	// what a client too old for the waiting world gets, and what a player who
	// has already chosen gets when their choice is not running yet.
	planHold
	// planRefuse means there is nothing to route them to.
	planRefuse
)

// String names a plan for the log line that records why a player went where
// they went.
func (p plan) String() string {
	switch p {
	case planJoin:
		return "join"
	case planWorld:
		return "world"
	case planHold:
		return "hold"
	case planRefuse:
		return "refuse"
	default:
		return "unknown"
	}
}

// decision is a plan plus the server it concerns.
type decision struct {
	Plan plan
	// Server is the chosen backend, and is meaningless for planWorld (where the
	// point is that no choice has been made yet) and planRefuse.
	Server int
	// Reason is why, for the log. Routing decisions are otherwise invisible:
	// when somebody asks "why did it put me there", this is the answer.
	Reason string
	// Message is what to tell the player, for planRefuse only.
	Message string
}

// decide works out what happens to a player.
//
// The waiting world is used when, and only when, there is something for the
// player to decide. Somebody with one server that is already running has no
// decision to make, and making them pass through an empty world to be told so
// would be a worse experience than the one they have now. Everyone else — more
// than one server to pick between, or a server that is not up yet — gets a
// world where the proxy can actually talk to them.
//
// An explicit choice always wins over all of this. A hostname naming a server,
// or a cookie left over from the waiting world's own transfer, means the player
// has already decided, and re-asking them would be a loop.
//
// One thing wins over even that: having no Discord account linked yet. Nothing
// about where a player may go can be worked out without one, so they go to the
// world to attend to it first.
func (p *Proxy) decide(sess *control.Session, host string, protocol int32, chosen int) decision {
	if len(sess.Servers) == 0 {
		return decision{Plan: planRefuse, Reason: "no servers configured", Message: msgNoServers}
	}
	ids := accessibleIDs(sess)
	if len(ids) == 0 {
		return decision{Plan: planRefuse, Reason: "no accessible servers", Message: msgNoAccess}
	}

	// A player with no Discord account attached is sent to the world before
	// anything else is considered, including a hostname or a choice they made a
	// moment ago. Everything past this point is decided against a Discord
	// account — which server they may use, whether they may start one, what it
	// costs — so there is nothing to route them by until they have one, and the
	// world is the only place the proxy can tell them so.
	//
	// It only applies where a world can actually be built. A client that cannot
	// be shown one cannot be told anything either, so it keeps the old
	// precedence and links the way it always did: from in game, on a backend,
	// once somebody else brings one up.
	if !sess.Linked && p.worldUnavailable(protocol) == "" {
		return decision{Plan: planWorld, Reason: "no linked Discord account yet"}
	}

	online := make(map[int]bool, len(sess.Servers))
	accessible := make(map[int]bool, len(sess.Servers))
	for _, srv := range sess.Servers {
		if srv.Accessible {
			accessible[srv.ID] = true
			online[srv.ID] = srv.Online
		}
	}

	// An explicit choice, in order of how deliberate it is: a cookie is a
	// choice this player made in the waiting world seconds ago, a hostname is
	// one they made when they added the server to their list.
	//
	// The cookie is checked against this login's own access list rather than
	// trusted, because it is stored on the client and a player can edit it.
	// An edited one names a server they are simply asked about again.
	if chosen != 0 && accessible[chosen] {
		if online[chosen] {
			return decision{Plan: planJoin, Server: chosen, Reason: "chosen in the waiting world"}
		}
		return holdOrRefuse(chosen, protocol, "chosen in the waiting world, not up yet")
	}
	if id, ok := forcedHost(host, sess.Servers); ok {
		if online[id] {
			return decision{Plan: planJoin, Server: id, Reason: "selected by hostname"}
		}
		return holdOrRefuse(id, protocol, "selected by hostname, not up yet")
	}

	// One server, already running: there is nothing to ask about.
	if len(ids) == 1 && online[ids[0]] {
		return decision{Plan: planJoin, Server: ids[0], Reason: "the only server, and it is up"}
	}

	why := p.worldUnavailable(protocol)
	if why == "" {
		return decision{Plan: planWorld, Reason: "letting the player choose"}
	}

	// No world to offer. Fall back to the mute hold, which works on any client
	// from 1.13 but cannot ask the player anything, so the long-standing
	// precedence picks for them. The reason travels with the decision: a player
	// held when they expected a world is otherwise indistinguishable, from the
	// outside, from a proxy that has simply broken.
	target, up := p.chooseTarget(sess, host)
	if up {
		return decision{Plan: planJoin, Server: target, Reason: "no waiting world: " + why}
	}
	return holdOrRefuse(target, protocol, "no waiting world: "+why)
}

// holdOrRefuse parks a player until their server is up, unless their client is
// too old even for that, in which case they are told why rather than left to
// time out against a silence they cannot interpret.
func holdOrRefuse(server int, protocol int32, reason string) decision {
	if !mcver.CanBeHeld(protocol) {
		return decision{Plan: planRefuse, Reason: reason + ", and too old to hold", Message: msgCannotHold}
	}
	return decision{Plan: planHold, Server: server, Reason: reason}
}
