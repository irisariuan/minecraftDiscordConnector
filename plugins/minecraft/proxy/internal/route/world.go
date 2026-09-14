package route

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/auth"
	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/control"
	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/limbo"
	"github.com/irisariuan/minecraftDiscordConnector/plugins/minecraft/proxy/internal/protocol"
)

// The waiting world: an empty room with no floor, where the proxy can finally
// say something to a player instead of leaving them on a connecting screen.
//
// It exists for one purpose — letting somebody choose where to go, and ask for
// it to be started — and it hands them over the moment that is settled. Nothing
// else about it is worth building out: there is no ground, no inventory and no
// other player, because everything of that kind is version-specific data the
// proxy would then have to keep correct across releases it has never seen.

// worldRefresh is how often the menu is rebuilt from the bot while a player is
// standing in the waiting world. Servers come up and go down underneath them,
// and a list that goes stale is one that invites a player to type a name that
// no longer means what it did.
const worldRefresh = 5 * time.Second

// errPlayerLeft is the ordinary end of a waiting-world session: the player shut
// the game, or walked away and the client gave up. It is not a failure.
var errPlayerLeft = errors.New("player left the waiting world")

// serveWorld runs a player's entire stay in the waiting world.
//
// It ends in one of three ways: the player picks a server that is running and
// is transferred to it, the server they are waiting for comes up and they are
// transferred to that, or they leave. The proxy never disconnects them.
func (p *Proxy) serveWorld(
	ctx context.Context,
	conn *protocol.Conn,
	hs *handshake,
	profile *auth.Profile,
	player control.Player,
	sess *control.Session,
) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	snap, ok := p.opts.Snapshots.Get(hs.Protocol)
	if !ok {
		return fmt.Errorf("no recorded world for protocol %d", hs.Protocol)
	}

	world, err := limbo.Enter(ctx, conn, limbo.Options{
		Protocol: hs.Protocol,
		Name:     profile.Name,
		UUID:     profile.ID,
		Skin:     skinFor(profile),
		Snapshot: snap,
		Logger:   p.log,
	})
	if err != nil {
		return fmt.Errorf("could not build the waiting world for %s: %w", profile.Name, err)
	}
	defer func() { _ = world.Close() }()

	p.log.Info("player waiting in world", "player", profile.Name, "protocol", hs.Protocol)

	w := &worldSession{
		proxy:  p,
		world:  world,
		hs:     hs,
		player: player,
		name:   profile.Name,
		menu:   buildMenu(sess),
		linked: sess.Linked,
	}
	return w.run(ctx)
}

// worldSession is one player's stay in the waiting world.
type worldSession struct {
	proxy  *Proxy
	world  *limbo.Session
	hs     *handshake
	player control.Player
	name   string
	linked bool

	// menu is the current list of choices, refreshed from the bot.
	menu []menuEntry
	// waitingFor is the server the player asked for, or zero if they have not
	// asked yet. Once set, the session's job is to watch for it coming up.
	waitingFor int
}

func (w *worldSession) run(ctx context.Context) error {
	w.greet()

	commands := w.world.Commands()
	ticker := time.NewTicker(worldRefresh)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()

		case line, ok := <-commands:
			if !ok {
				return errPlayerLeft
			}
			done, err := w.handle(ctx, line)
			if err != nil || done {
				return err
			}

		case <-ticker.C:
			done, err := w.refresh(ctx)
			if err != nil || done {
				return err
			}
		}
	}
}

// greet is the first thing a player sees. It has to answer, in the two seconds
// somebody gives an unexpected screen, both "where am I" and "what do I do".
func (w *worldSession) greet() {
	lines := []string{
		"",
		"§b§lYou are in the waiting room§r",
		"§7Nothing here but the choices below.",
		"",
	}
	lines = append(lines, menuLines(w.menu)...)
	if !w.linked {
		lines = append(lines,
			"",
			"§7Your Discord account is not linked, so you cannot ask for a",
			"§7server to be started. You can still join one that is running.")
	}
	w.say(lines...)
}

// handle acts on one typed command, reporting whether the stay is over.
func (w *worldSession) handle(ctx context.Context, line string) (bool, error) {
	cmd := parseCommand(line)
	switch cmd.Intent {
	case intentList:
		w.say(menuLines(w.menu)...)
	case intentHelp:
		w.say(
			"§7§lWhat you can type§r",
			"  §f/join <server>§7 — go to a server, starting it if it is down",
			"  §f/servers§7 — show the list again",
			"  §f/link§7 — how to connect your Discord account")
	case intentLink:
		w.sayLinkHelp()
	case intentJoin:
		return w.join(ctx, cmd.Arg)
	default:
		w.say(fmt.Sprintf("§cThere is no §f/%s§c here. Type §f/help§c to see what there is.", cmd.Verb))
	}
	return false, nil
}

// join is the whole point of the room.
func (w *worldSession) join(ctx context.Context, arg string) (bool, error) {
	entry, err := resolve(w.menu, arg)
	if err != nil {
		w.say("§c" + capitalise(err.Error()) + ".")
		return false, nil
	}

	if entry.Online {
		return true, w.transfer(entry)
	}

	if !w.linked {
		w.say(
			"§e"+entry.Tag+" is not running, and asking for it to be started needs",
			"§ea linked Discord account.")
		w.sayLinkHelp()
		return false, nil
	}

	w.say("§7Asking for §f" + entry.Tag + "§7 to be started…")
	res, err := w.proxy.opts.Control.Start(ctx, w.player, entry.ID)
	if err != nil {
		w.proxy.log.Warn("start request failed", "player", w.name, "server", entry.Tag, "error", err)
		w.say("§cThe server manager did not answer. Try again in a moment.")
		return false, nil
	}

	w.say(startReply(res))
	if !startKeepsWaiting(res.Status) {
		// Nothing more will happen on its own. Leaving them waiting silently
		// would look like the proxy had hung, so put the choices back in front
		// of them instead.
		w.say("§7You are still in the waiting room. §f/servers§7 to choose again.")
		return false, nil
	}

	w.waitingFor = entry.ID
	w.say("§7Stay here — you will be moved the moment it is up.")
	return false, nil
}

// refresh rebuilds the menu from the bot and, if the server the player is
// waiting for has come up, moves them to it.
func (w *worldSession) refresh(ctx context.Context) (bool, error) {
	sess, err := w.proxy.opts.Control.Session(ctx, w.player)
	if err != nil {
		// A momentary failure to reach the bot is not worth telling the player
		// about: the next tick is five seconds away and will probably succeed.
		w.proxy.log.Debug("waiting-world refresh failed", "player", w.name, "error", err)
		return false, nil
	}

	previous := w.menu
	w.menu = buildMenu(sess)
	w.linked = sess.Linked

	if w.waitingFor != 0 {
		for _, e := range w.menu {
			if e.ID == w.waitingFor && e.Online {
				return true, w.transfer(e)
			}
		}
		return false, nil
	}

	// Nobody is waiting on a particular server, but one coming up is news: it
	// turns "there is nothing to join" into a choice they can act on.
	for _, e := range w.menu {
		if !e.Online {
			continue
		}
		if wasOnline(previous, e.ID) {
			continue
		}
		w.say("§a" + e.Tag + " is now running. §7Type §f/join " + e.nameFor() + "§7 to go there.")
	}
	return false, nil
}

// transfer hands the player over to a backend by sending them back to this same
// proxy with their choice recorded.
//
// Going back through the front door rather than switching the connection
// underneath them is what keeps this simple enough to be correct. The second
// connection is an ordinary login, down the same path every other player takes,
// so there is no second implementation of forwarding, compression or identity
// to keep in step with the first.
func (w *worldSession) transfer(entry menuEntry) error {
	host, port := w.returnAddress()
	w.say("§aSending you to " + entry.Tag + "…")
	w.proxy.log.Info("transferring player",
		"player", w.name, "server", entry.Tag, "host", host, "port", port)

	if err := w.world.StoreCookie(choiceCookie, encodeChoice(entry.ID, time.Now())); err != nil {
		return fmt.Errorf("store choice cookie: %w", err)
	}
	if err := w.world.Transfer(host, port); err != nil {
		return fmt.Errorf("transfer to %s: %w", entry.Tag, err)
	}
	return nil
}

// returnAddress is where to send a transferred player back to.
//
// The address the client itself used is the one address known to work for this
// client: it resolved, it was reachable, and any SRV record has already been
// followed, because the client writes the resolved host and port into its
// handshake. An operator-configured public host is only a fallback for the case
// where the handshake address was something unroutable, such as a container
// name seen through a port forward.
func (w *worldSession) returnAddress() (string, int) {
	host := cleanHost(w.hs.Host)
	port := int(w.hs.Port)
	if host == "" || port == 0 {
		cfg := w.proxy.opts.Poller.Snapshot()
		if cfg != nil && cfg.PublicHost != "" {
			return cfg.PublicHost, cfg.ListenPort
		}
	}
	return host, port
}

func (w *worldSession) sayLinkHelp() {
	w.say(
		"§7§lLinking your account§r",
		"§7Run §f/link§7 in Discord and follow what it tells you.",
		"§7You only have to do it once.")
}

// say sends lines to the player, giving up quietly if they have gone. A player
// who has left is not an error worth propagating from a cosmetic write.
func (w *worldSession) say(lines ...string) {
	for _, line := range lines {
		if err := w.world.Say(line); err != nil {
			w.proxy.log.Debug("could not talk to waiting player", "player", w.name, "error", err)
			return
		}
	}
}

// skinFor hands the verified profile properties to the waiting world, so a
// player sees themselves rather than a default skin while they choose.
func skinFor(profile *auth.Profile) []limbo.Property {
	if len(profile.Properties) == 0 {
		return nil
	}
	out := make([]limbo.Property, 0, len(profile.Properties))
	for _, prop := range profile.Properties {
		out = append(out, limbo.Property{
			Name:      prop.Name,
			Value:     prop.Value,
			Signature: prop.Signature,
		})
	}
	return out
}

func wasOnline(entries []menuEntry, id int) bool {
	for _, e := range entries {
		if e.ID == id {
			return e.Online
		}
	}
	// Unknown a moment ago: treat it as having been up, so that a server
	// appearing in the list for the first time does not read as "just started".
	return true
}

// capitalise makes an error message read as a sentence. The errors it is given
// are written lowercase, as Go errors are, but they are shown to a player.
func capitalise(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}
