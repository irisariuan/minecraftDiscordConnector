package route

import (
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/control"
)

// The menu a player sees in the waiting world.
//
// Everything here is pure: it turns a session into lines of text and turns a
// typed command into an intent. The packet work lives in internal/limbo and the
// decisions live in limbo.go, so that the wording — the part most likely to be
// changed by somebody who is not thinking about the protocol — can be read and
// tested on its own.

// menuEntry is one server as the player sees it.
type menuEntry struct {
	ID     int
	Tag    string
	Slug   string
	Online bool
	// CanStart is whether this player may bring it up themselves. When false a
	// vote may still be possible; the bot decides that, not the proxy.
	CanStart bool
	// PollPending means a vote is already open, so asking again would only
	// duplicate it.
	PollPending bool
	PollURL     string
}

// buildMenu lists the servers a player may use, in a stable order.
//
// Ordering is by tag rather than by id: the player reads this list, and a list
// that reorders itself when an administrator adds a server is a list nobody can
// learn. Servers that are already running come first, because that is the
// choice with no waiting attached.
func buildMenu(sess *control.Session) []menuEntry {
	var entries []menuEntry
	for _, srv := range sess.Servers {
		if !srv.Accessible {
			continue
		}
		entries = append(entries, menuEntry{
			ID:          srv.ID,
			Tag:         srv.Tag,
			Slug:        slugify(srv.Tag),
			Online:      srv.Online,
			CanStart:    srv.CanStart,
			PollPending: srv.PollPending,
			PollURL:     srv.PollURL,
		})
	}
	sort.SliceStable(entries, func(i, j int) bool {
		if entries[i].Online != entries[j].Online {
			return entries[i].Online
		}
		if !strings.EqualFold(entries[i].Tag, entries[j].Tag) {
			return strings.ToLower(entries[i].Tag) < strings.ToLower(entries[j].Tag)
		}
		return entries[i].ID < entries[j].ID
	})
	return entries
}

// nameFor is what a player types to pick this server. Tags are operator-written
// and may contain spaces, which cannot survive a command argument, so the slug
// is preferred and the id is the last resort for a tag that slugifies to
// nothing at all (one written entirely in a non-Latin script, say).
func (e menuEntry) nameFor() string {
	if e.Slug != "" {
		return e.Slug
	}
	return strconv.Itoa(e.ID)
}

// menuLines renders the list a player sees on arrival and on /servers.
//
// The footer differs by whether the player has linked a Discord account,
// because the two of them can do different things: an unlinked player has
// exactly one command available and should be told which, rather than being
// shown two they will only be refused.
func menuLines(entries []menuEntry, linked bool) []string {
	if len(entries) == 0 {
		return []string{"§cThere are no servers you can use here."}
	}
	lines := make([]string, 0, len(entries)+3)
	lines = append(lines, "§8§m                              ")
	for _, e := range entries {
		lines = append(lines, "  "+e.line())
	}
	lines = append(lines, "§8§m                              ")
	if linked {
		lines = append(lines,
			"§7§f/join <server>§7 goes to one that is running.",
			"§7§f/start <server>§7 brings a stopped one up.")
	} else {
		lines = append(lines,
			"§7Link your Discord account first: §f/link <your Discord name>§7.")
	}
	return lines
}

// line renders one server: what it is called, whether it is up, and what
// typing its name would actually do.
func (e menuEntry) line() string {
	name := e.nameFor()
	switch {
	case e.Online:
		return fmt.Sprintf("§a● §f%s §7— running, §ajoin now§7 (§f/join %s§7)", e.Tag, name)
	case e.PollPending:
		return fmt.Sprintf("§e● §f%s §7— a vote is already open on Discord", e.Tag)
	case e.CanStart:
		return fmt.Sprintf("§7● §f%s §7— stopped, §fyou can start it§7 (§f/start %s§7)", e.Tag, name)
	default:
		return fmt.Sprintf("§7● §f%s §7— stopped, §f/start %s§7 will ask for a vote", e.Tag, name)
	}
}

// intent is what a player asked the waiting world to do.
type intent int

const (
	// intentUnknown is a command the waiting world does not implement. It is
	// answered rather than ignored: silence reads as a broken server.
	intentUnknown intent = iota
	// intentList reprints the menu.
	intentList
	// intentJoin goes to a server that is already running. It never starts
	// one: bringing a server up costs somebody credit, or a vote, or both, and
	// that is not something to do as a side effect of a player picking a name
	// off a list.
	intentJoin
	// intentStart asks for a stopped server to be brought up.
	intentStart
	// intentHelp explains what can be typed.
	intentHelp
	// intentLink connects the player's Discord account, naming it.
	intentLink
)

// command is a parsed line typed by the player.
type command struct {
	Intent intent
	// Arg is the raw argument, unresolved. Empty when none was given.
	Arg string
	// Verb is what they actually typed, for the "unknown command" reply.
	Verb string
}

// parseCommand turns a typed line into an intent.
//
// The client sends the command without its leading slash, but a player who
// types one into chat rather than into the command line would send it with, and
// both should mean the same thing.
func parseCommand(line string) command {
	line = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(line), "/"))
	if line == "" {
		return command{Intent: intentHelp}
	}
	verb, arg, _ := strings.Cut(line, " ")
	verb = strings.ToLower(verb)
	arg = strings.TrimSpace(arg)

	switch verb {
	case "join", "server", "connect", "go":
		if arg == "" {
			return command{Intent: intentList, Verb: verb}
		}
		return command{Intent: intentJoin, Arg: arg, Verb: verb}
	case "start":
		if arg == "" {
			return command{Intent: intentList, Verb: verb}
		}
		return command{Intent: intentStart, Arg: arg, Verb: verb}
	case "servers", "list":
		return command{Intent: intentList, Verb: verb}
	case "help", "?":
		return command{Intent: intentHelp, Verb: verb}
	case "link":
		return command{Intent: intentLink, Arg: arg, Verb: verb}
	default:
		return command{Intent: intentUnknown, Verb: verb}
	}
}

// resolve finds the server a player meant.
//
// Players type what they see, so a tag, its slug and its id all resolve, and an
// unambiguous prefix does too — "surv" for "Survival" — because the alternative
// is making somebody type a long name exactly right with no tab completion to
// help them. An ambiguous prefix is reported as ambiguous rather than guessed.
func resolve(entries []menuEntry, arg string) (menuEntry, error) {
	want := strings.ToLower(strings.TrimSpace(arg))
	if want == "" {
		return menuEntry{}, fmt.Errorf("name a server")
	}

	for _, e := range entries {
		if strings.EqualFold(e.Tag, want) || e.Slug == want || strconv.Itoa(e.ID) == want {
			return e, nil
		}
	}

	var matches []menuEntry
	for _, e := range entries {
		if strings.HasPrefix(strings.ToLower(e.Tag), want) || strings.HasPrefix(e.Slug, want) {
			matches = append(matches, e)
		}
	}
	switch len(matches) {
	case 1:
		return matches[0], nil
	case 0:
		return menuEntry{}, fmt.Errorf("there is no server called %q here", arg)
	default:
		names := make([]string, 0, len(matches))
		for _, m := range matches {
			names = append(names, m.nameFor())
		}
		return menuEntry{}, fmt.Errorf("%q could mean %s", arg, strings.Join(names, " or "))
	}
}

// startReply turns a control-API start result into a line of chat.
//
// The bot's own message is preferred wherever it has one: it knows the price, the
// poll and the permission rule, and repeating that knowledge here would mean two
// places to keep in step. The proxy only supplies a fallback and the colour.
func startReply(res *control.StartResult) string {
	msg := strings.TrimSpace(res.Message)
	switch res.Status {
	case control.StatusStarted:
		if msg == "" {
			msg = "Starting the server. You will be moved as soon as it is up."
		}
		return "§a" + msg
	case control.StatusAlreadyOnline:
		if msg == "" {
			msg = "That server is already running. Moving you there."
		}
		return "§a" + msg
	case control.StatusPollCreated, control.StatusPollPending:
		if msg == "" {
			msg = "A vote is open on Discord. You will be moved if it passes."
		}
		line := "§e" + msg
		if res.PollURL != "" {
			line += " §7(" + res.PollURL + ")"
		}
		return line
	case control.StatusNoChannel:
		if msg == "" {
			msg = "No vote channel is set up here. Start the vote from Discord instead."
		}
		return "§e" + msg
	case control.StatusNotLinked:
		if msg == "" {
			msg = "Link your Discord account before you can ask for a server to be started."
		}
		return "§e" + msg
	default:
		if msg == "" {
			msg = "That server could not be started."
		}
		return "§c" + msg
	}
}

// startKeepsWaiting reports whether a start outcome is one where staying in the
// waiting world still makes sense.
//
// A vote that is open may yet pass, and a server that is starting will come up,
// so both are worth waiting through. A refusal is not: nothing more will happen
// on its own, and a player left staring at an empty world would reasonably
// assume the proxy had hung.
func startKeepsWaiting(status string) bool {
	switch status {
	case control.StatusStarted,
		control.StatusAlreadyOnline,
		control.StatusPollCreated,
		control.StatusPollPending:
		return true
	default:
		return false
	}
}
