package route

import (
	"sort"
	"strings"

	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/control"
)

// slugify reduces a server tag to the token a player can type into a hostname.
// Tags are operator-written and routinely contain spaces and capitals, neither
// of which survive a DNS label.
func slugify(tag string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(strings.TrimSpace(tag)) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9', r == '-':
			b.WriteRune(r)
		case r == ' ' || r == '_':
			b.WriteRune('-')
		}
	}
	return b.String()
}

// forcedHost resolves the hostname a player connected with to a server.
//
// This is how a player chooses between several servers without needing to be
// spoken to: point survival.example.com and creative.example.com at the same
// proxy, and the name they typed selects the destination. It is the only
// selection mechanism available during a login-phase hold, where no chat or
// command can reach the client, and it has the pleasant property of working
// identically on every client version ever released.
//
// Matching is against the first label of the hostname, so both
// "survival.example.com" and a bare "survival" select the same server.
func forcedHost(host string, servers []control.SessionServerInfo) (int, bool) {
	label := strings.ToLower(strings.TrimSpace(host))
	if i := strings.IndexByte(label, '.'); i >= 0 {
		label = label[:i]
	}
	if label == "" {
		return 0, false
	}
	for _, srv := range servers {
		if !srv.Accessible {
			continue
		}
		if slugify(srv.Tag) == label {
			return srv.ID, true
		}
	}
	return 0, false
}

// accessibleIDs lists the servers a player may use, in a stable order.
func accessibleIDs(sess *control.Session) []int {
	var ids []int
	for _, srv := range sess.Servers {
		if srv.Accessible {
			ids = append(ids, srv.ID)
		}
	}
	sort.Ints(ids)
	return ids
}

// onlineAccessibleIDs lists the servers a player may use that are running.
func onlineAccessibleIDs(sess *control.Session) []int {
	var ids []int
	for _, srv := range sess.Servers {
		if srv.Accessible && srv.Online {
			ids = append(ids, srv.ID)
		}
	}
	sort.Ints(ids)
	return ids
}
