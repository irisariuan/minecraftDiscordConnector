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
	// linkState is the last state reported for a /link this player started, so
	// that a change in it can be announced once rather than every refresh.
	linkState string
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
	lines = append(lines, menuLines(w.menu, w.linked)...)
	if !w.linked {
		lines = append(lines, "")
		lines = append(lines, linkPromptLines()...)
	}
	w.say(lines...)
}

// handle acts on one typed command, reporting whether the stay is over.
//
// An unlinked player gets one command and no others. Going anywhere and
// starting anything are both decided against a Discord account and paid for out
// of its credit, so for somebody without one there is nothing to route and
// nothing to charge — only the linking itself is available to them.
func (w *worldSession) handle(ctx context.Context, line string) (bool, error) {
	cmd := parseCommand(line)
	if !w.linked && (cmd.Intent == intentJoin || cmd.Intent == intentStart) {
		w.say("§eYour Discord account is not linked yet, so that is not available.")
		w.say(linkPromptLines()...)
		return false, nil
	}
	switch cmd.Intent {
	case intentList:
		w.say(menuLines(w.menu, w.linked)...)
	case intentHelp:
		w.sayHelp()
	case intentLink:
		return false, w.link(ctx, cmd.Arg)
	case intentJoin:
		return w.join(cmd.Arg)
	case intentStart:
		return w.start(ctx, cmd.Arg)
	default:
		w.say(fmt.Sprintf("§cThere is no §f/%s§c here. Type §f/help§c to see what there is.", cmd.Verb))
	}
	return false, nil
}

// sayHelp lists what this particular player can type, which is not the same
// list for everybody: offering an unlinked player commands that will refuse
// them is worse than not offering them at all.
func (w *worldSession) sayHelp() {
	if !w.linked {
		w.say(
			"§7§lWhat you can type§r",
			"  §f/link <your Discord name>§7 — connect your Discord account",
			"  §f/servers§7 — show the list again",
			"§7Everything else needs a linked account.")
		return
	}
	w.say(
		"§7§lWhat you can type§r",
		"  §f/join <server>§7 — go to a server that is running",
		"  §f/start <server>§7 — ask for a stopped server to be brought up",
		"  §f/servers§7 — show the list again",
		"  §f/link <your Discord name>§7 — connect your Discord account")
}

// join goes to a server that is already up, and only to one that is.
//
// A stopped server is not started from here. /start is where that happens, and
// keeping the two apart means nobody spends credit, or raises a vote in a
// Discord channel other people are reading, by typing the wrong name into what
// they thought was a way of moving.
func (w *worldSession) join(arg string) (bool, error) {
	entry, err := resolve(w.menu, arg)
	if err != nil {
		w.say("§c" + capitalise(err.Error()) + ".")
		return false, nil
	}
	if !entry.Online {
		w.say(
			"§e"+entry.Tag+" is not running.",
			"§7Type §f/start "+entry.nameFor()+"§7 to ask for it to be brought up.")
		return false, nil
	}
	return true, w.transfer(entry)
}

// start asks the bot to bring a server up, and is the whole point of the room.
//
// The proxy decides nothing about it. Whether this player may start a server
// outright, whether a vote has to be raised instead, and what it costs are all
// the bot's rules, applied exactly as /startserver applies them on Discord; the
// answer that comes back is shown to the player as it was written.
func (w *worldSession) start(ctx context.Context, arg string) (bool, error) {
	entry, err := resolve(w.menu, arg)
	if err != nil {
		w.say("§c" + capitalise(err.Error()) + ".")
		return false, nil
	}

	if entry.Online {
		w.say("§a" + entry.Tag + " is already running.")
		return true, w.transfer(entry)
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

// link connects this Minecraft account to a Discord one.
//
// The proof runs the way it always has: a one-time code appears in game, where
// only the person actually holding this Minecraft account can read it, and has
// to be typed on Discord, where only the owner of that account can type it.
// Neither half is enough alone, which is what makes the pair of them a link.
//
// Settling it takes a person reading a direct message, so this call only gets
// the code in front of them. How it ends arrives on a later refresh.
func (w *worldSession) link(ctx context.Context, arg string) error {
	if strings.TrimSpace(arg) == "" {
		w.say(linkPromptLines()...)
		return nil
	}
	if w.linked {
		w.say("§7Your Discord account is already linked. Nothing to do.")
		return nil
	}

	res, err := w.proxy.opts.Control.Link(ctx, w.player, arg)
	if err != nil {
		w.proxy.log.Warn("link request failed", "player", w.name, "error", err)
		w.say("§cThe bot did not answer. Try again in a moment.")
		return nil
	}
	if res.Status == control.LinkPending {
		w.linkState = control.LinkStatePending
	}
	w.say(linkReply(res)...)
	return nil
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
	wasLinked := w.linked
	w.menu = buildMenu(sess)
	w.linked = sess.Linked
	w.reportLink(sess, wasLinked)

	if w.waitingFor != 0 {
		for _, e := range w.menu {
			if e.ID == w.waitingFor && e.Online {
				return true, w.transfer(e)
			}
		}
		return false, nil
	}

	// Nobody is waiting on a particular server, but one coming up is news: it
	// turns "there is nothing to join" into a choice they can act on. Only for
	// somebody who can act on it — telling an unlinked player to type a command
	// that will refuse them is worse than not telling them at all.
	if !w.linked {
		return false, nil
	}
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
	host, port, ok := w.returnAddress()
	if !ok {
		// Transferring to an address that cannot be dialled would drop the
		// player onto their server list with no explanation, which is worse
		// than the waiting room they are already in.
		w.proxy.log.Warn("cannot transfer: no address to send the player back to",
			"player", w.name, "server", entry.Tag)
		w.say(
			"§c"+entry.Tag+" is ready, but this proxy does not know what address",
			"§cto send you back to. Ask an administrator to set the proxy's public",
			"§chost, then reconnect.")
		return nil
	}
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
// name seen through a port forward. With neither, there is nowhere to send the
// player and the caller has to say so instead of transferring them into the
// dark.
func (w *worldSession) returnAddress() (host string, port int, ok bool) {
	host = cleanHost(w.hs.Host)
	port = int(w.hs.Port)
	if host != "" && port > 0 {
		return host, port, true
	}

	cfg := w.proxy.opts.Poller.Snapshot()
	if cfg != nil && cfg.PublicHost != "" && cfg.ListenPort > 0 {
		return cfg.PublicHost, cfg.ListenPort, true
	}
	return "", 0, false
}

// reportLink tells a player how the /link they started turned out.
//
// It is reported from the refresh rather than waited on, because settling it
// needs somebody to read a direct message and type into it — which may take
// minutes, or never happen. Each state is announced once: a line repeated every
// five seconds would bury everything else they are told.
func (w *worldSession) reportLink(sess *control.Session, wasLinked bool) {
	if w.linked && !wasLinked {
		w.linkState = control.LinkStateLinked
		w.say(
			"§aYour Discord account is linked.",
			"§7You can use §f/join§7 and §f/start§7 now.")
		w.say(menuLines(w.menu, true)...)
		return
	}
	if sess.Link == nil || sess.Link.State == w.linkState {
		return
	}
	w.linkState = sess.Link.State
	if sess.Link.State == control.LinkStateFailed {
		msg := strings.TrimSpace(sess.Link.Message)
		if msg == "" {
			msg = "That link attempt did not go through."
		}
		w.say("§c"+msg, "§7Type §f/link <your Discord name>§7 to try again.")
	}
}

// linkPromptLines is the standing instruction for somebody who has not linked.
// It is shown on arrival, whenever a command is refused for want of a link, and
// when /link is typed with nothing after it.
func linkPromptLines() []string {
	return []string{
		"§7§lLinking your account§r",
		"§7Type §f/link <your Discord name>§7 — your Discord username or your",
		"§7user id. The bot will message you there with what to do next.",
		"§7You only have to do it once.",
	}
}

// linkReply turns a control-API link result into chat.
//
// As with a start, the bot's own wording is preferred wherever it has some: it
// knows which account it found and why it would not do, and saying it twice in
// two places would mean two places to keep in step.
func linkReply(res *control.LinkResult) []string {
	msg := strings.TrimSpace(res.Message)
	if res.Status != control.LinkPending {
		if msg == "" {
			msg = "That did not work. Check the name and try again."
		}
		return []string{"§c" + msg}
	}

	lines := []string{"§8§m                              "}
	if res.Discord != "" {
		lines = append(lines, "§7Sent a message to §f"+res.Discord+"§7 on Discord.")
	} else {
		lines = append(lines, "§7Sent you a message on Discord.")
	}
	lines = append(lines,
		"§7Open it and type this code:",
		"§b§l  "+res.Code,
		"§8§m                              ",
		"§7Nobody but you can see this code. Stay here — you will be told",
		"§7when it goes through.")
	return lines
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
