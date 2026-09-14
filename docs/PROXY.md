# The Minecraft proxy

The proxy is an optional Go program (`plugins/minecraft/proxy/`) that fronts
every managed Minecraft server on **one** exposed port. Players always connect to
the same address; the proxy works out which backend they want and routes them
there.

Its real purpose is what happens when that backend is **down**. Instead of
refusing the connection with "Can't connect to server", the proxy *keeps* the
player, in an empty world where they can see what is available and ask for a
server to be started — immediately if they are allowed to, otherwise by raising
a start vote in Discord.

**Connecting starts nothing by itself.** A server comes up because somebody
asked for it, in the waiting room or on Discord, and never because a player
turned up.

The proxy owns no database, no Discord connection and no credentials. It is a
child process of the bot and asks the bot for every decision over a **Unix
domain socket** (`plugins/minecraft/proxy/CONTROL_API.md`). Nothing about that
channel touches the network: there is no port to firewall, and access is decided
by filesystem permissions on the socket, which the bot creates mode 0600.

## The two ways of waiting

The proxy is the online-mode authority: it performs the encryption handshake and
verifies the player against Mojang itself. The backends behind it run in offline
mode and trust the identity the proxy forwards to them.

From there a player who cannot be sent straight to a running server waits in one
of two places. Both keep them connected indefinitely; the difference is whether
the proxy can talk to them.

### The waiting room

An empty world, served by the proxy itself, where the player floats in the void
and can read and type. It lists the servers they may use, says which are
running, and takes commands:

| typed in game | what it does |
| --- | --- |
| `/join <server>` | go there, starting it first if it is down |
| `/servers` | print the list again |
| `/help` | what can be typed |
| `/link` | how to connect a Discord account |

Names can be given as the server's tag, its simplified form, its id, or any
unambiguous prefix — `surv` finds `Survival` as long as nothing else starts the
same way. Plain chat works too, so a player who types `join survival` without
the slash is understood.

Asking for a stopped server applies exactly the rules `/startserver` applies on
Discord: an immediate start for a linked account holding the `startServer`
permission, and otherwise a start-approval poll with the usual fees and counts.
Whatever the bot says about it is what the player is shown, word for word.

When the server is up the player is **transferred**: their client reconnects to
the same address by itself, carrying the choice they made, and lands on the
server. They are never returned to the server list and never see an error.

There is no tab completion, and a typed command shows red in the chat box before
it is sent. That is deliberate — see "Known limitations" in the design notes.

### The silent hold

Where the proxy cannot build a world for a client, it parks the player **in the
login phase** instead. Nothing is sent past the encryption exchange, so their
client sits on its own connecting screen: no error, no kick, no prompt to
reconnect. When the backend comes up, the proxy relays the real Login Success
and the hold resolves into an ordinary join with nothing lost.

Nothing can be shown to a player being held, and nothing can be asked of them
either, so **no server is started on their behalf**. They wait until somebody
who can be asked — another player in the waiting room, or somebody on Discord —
brings one up, and are then joined to it.

A client stalled mid-login gives up after about thirty seconds of silence, so
the hold sends it a login plugin message every ten seconds on a channel no
plugin claims. The vanilla client always answers such a message, which is all
the hold needs. Login plugin messages arrived in **Minecraft 1.13**; a client
older than that cannot be held and is told so plainly rather than left to time
out. It can still be routed to a server that is already running.

### Which one a player gets

The waiting room needs two things, and both have to be true:

1. **A client version the proxy knows the packet numbering for.** That is 1.20.5
   through 1.21.10, and 26.2. Two releases in between — 1.21.11 and 26.1 — have
   no published numbering and are deliberately left out rather than guessed at.
2. **A recorded world for that version.** See below.

Anything else is held. Nothing needs configuring either way, and no player is
ever worse off than they were before the waiting room existed.

## Recorded worlds

Before a modern client will enter a world it demands a long list of registries
describing it — dimension types, biomes, damage types and a couple of dozen more.
The list grows with every release and a client that finds one wrong does not
complain, it disconnects.

Rather than ship that data and watch it rot, the proxy **takes it from your own
servers** and keeps it in `data/mcproxy-worlds/`. It does that two ways, and you
do not have to do anything for either:

- **It fetches one.** Within a minute of a server coming up, the proxy asks it
  what version it speaks, logs in, notes the registry set and hangs up — before
  the point where a server would put a player in the world. No join message, no
  entry in the player list, nothing for your connector to report. Nobody sees it.
- **It records one.** Whenever a real player joins, the proxy notes what that
  server sent them. This is the better of the two, because the packet that puts
  a player in a world can only be *copied* from a real join; a fetched world has
  to have that one packet composed instead. So a fetched world is provisional,
  and the first real join at that version replaces it.

What this means in practice:

- **There is nothing to set up and nothing to trigger.** Start a server once and
  the waiting room exists from then on, whether or not anybody joined.
- **The player whose join is recorded pays a small cost**: their client receives
  the registry set in full rather than the abbreviated form it would normally
  negotiate. It is a few tens of kilobytes, once per version per day.
- **Worlds refresh daily**, because a data pack, a mod or a game update changes
  what a server sends.
- **The directory is disposable.** Delete it and it fills itself in again. It is
  in `.gitignore` and holds nothing sensitive.
- **A version no server of yours runs has no waiting room.** A client older or
  newer than all your backends gets the silent hold instead.

Set `MC_PROXY_WORLD_CACHE` to move it, or to an empty string to turn the waiting
room off entirely and hold every player instead.

### When the waiting room does not appear

Almost always one of three things, and the proxy log says which. Every login
writes a `routing player` line carrying a `plan` and a `reason`; when the plan is
`hold` the reason names the cause:

| reason | what to do |
| --- | --- |
| `nothing has been recorded for this client version yet` | Start a server and wait a minute — the proxy fetches a world from it on its own. If that does not happen, no server of yours runs this client's version, and there is nowhere for the proxy to get one. |
| `no packet numbering is known for this client version` | The proxy cannot build a world for 1.21.11 or 26.1, or for anything older than 1.20.5. Those players are held instead. |
| `the waiting world is switched off` | `MC_PROXY_WORLD_CACHE` is empty, or the cache directory could not be opened — there will be a warning at startup saying so. |

`/proxy status` shows the same thing from Discord, as a list of the client
versions that have a recorded room.

If `data/mcproxy-worlds/` does not exist at all, the proxy is not running this
build: the directory is created at startup. Run `bun run build:proxy` and
restart the bot.

## Choosing between servers

In order of precedence:

**1. A choice just made in the waiting room.** Carried in a cookie the client
holds for two minutes. It is re-checked against the player's own permissions on
arrival, so editing it gains nothing.

**2. The hostname the player connected with.** Point several names at the proxy:

```
survival.example.com  ─┐
creative.example.com  ─┼─►  the one proxy, one port
mc.example.com        ─┘
```

A player connecting to `survival.example.com` gets the server whose tag reduces
to `survival`. The comparison uses the first label of the hostname against a
simplified form of the tag: lower-cased, spaces and underscores turned into
hyphens, other punctuation dropped. So a server tagged `Survival` matches
`survival`, and one tagged `Hard Mode` matches `hard-mode`.

This is the only mechanism that works during a silent hold, and it works on
every client version. It also selects which server a player's join *starts* when
everything is down.

**3. The waiting room**, where they are asked.

**4. Failing all of that**, the proxy prefers any server that is already running
and falls back to the lowest server id — stable across reconnects rather than
arbitrary. If you run more than one server and have players on versions that
only get the silent hold, set up the hostnames: it is the only way those players
can express a preference.

A player with exactly one server, already running, is never asked anything and
goes straight there.

### Before you rely on long holds

The silent hold keeps a client alive by sending it a login plugin message every
ten seconds, which the vanilla client always answers. That the client then waits
*indefinitely* follows from how its read timeout works, but it is inferred
rather than documented, and no Mojang documentation rules out a separate hard
cap on how long a login may take.

So before you depend on it, test it: join while a server is down and stay there
past 30 seconds, past a minute, and past five minutes, on the oldest client
versions your players use. If a client gives up with "timed out", the hold is not
working for that version and those players should be told to start servers from
Discord instead. The waiting room is not affected — it keeps the connection alive
with ordinary keep-alives, which are documented to work indefinitely.

### A waiting player is never kicked

That holds even when the vote fails. A rejected or expired poll leaves the
player exactly where they were, connected and waiting, free to disconnect and
try again whenever they like. The proxy does **not** re-raise a poll on their
behalf, because that would charge the poll fee again and spam the channel. If a
vote fails, someone has to ask again — on Discord, in the waiting room, or by
rejoining.

A player in the waiting room is told what happened. A player being held silently
is not, and will sit on the connecting screen until they give up. Tell your
players that, or keep an eye on the vote channel for them.

## Building


The proxy is not built by `bun install`. Build it once (and after every update):

```sh
bun run build:proxy
```

That produces `plugins/minecraft/proxy/bin/mcproxy`, which is git-ignored. The
Docker image builds it automatically in its own Go stage, so `docker compose
build` needs no extra step.

If the binary is missing, the bot logs one actionable line telling you to run
`bun run build:proxy` and does **not** retry — no restart loop, no noise.

## Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `MC_PROXY_ENABLED` | *(unset — off)* | Set to `true`/`1`/`yes`/`on` to run the proxy at all. Anything else and the plugin logs one line and stays completely inert. |
| `MC_PROXY_LISTEN_PORT` | `25565` | Public Minecraft port the proxy accepts clients on. This is the port your players connect to. |
| `MC_PROXY_IPC_PATH` | `data/mcproxy.sock` | Unix socket the bot serves the control API on, and the only channel between the bot and the proxy. Its directory is created if missing, and the socket is set to mode 0600. A stale socket left by a crash is cleared on startup, but a socket a *live* process is still serving is never stolen — the bot refuses to start instead. |
| `MC_PROXY_PUBLIC_HOST` | *(empty)* | Address players are sent back to when the waiting room transfers them. Normally unnecessary: the proxy reuses the address the client itself connected with, which is the one address known to work for that client. Set it only when that address is not reachable from outside, such as a container name seen through a port forward. |
| `MC_PROXY_WORLD_CACHE` | `data/mcproxy-worlds` | Directory of worlds recorded from your backends, which is what the waiting room is built from. Safe to delete; it fills itself in again. Set it empty to turn the waiting room off and hold every player silently instead. |
| `MC_PROXY_BIN` | `plugins/minecraft/proxy/bin/mcproxy` | Path to the compiled proxy binary. |
| `MC_PROXY_TOKEN` | *(random per start)* | Bearer token guarding the control API. When unset the bot generates a random one at startup and hands it to the child in its environment — which is what you want unless you are running the proxy out-of-tree. |

The bot restarts the child if it exits, with exponential backoff from 1s to 30s,
and stops restarting once the bot itself begins shutting down.

## Per-server configuration

Each Minecraft server record carries a `proxy` block in its `Server.config`
JSON. It is optional with defaults, so existing servers keep working untouched:

```json
{
  "proxy": {
    "enabled": true,
    "host": "127.0.0.1",
    "forwarding": "none",
    "forwardingSecret": null
  }
}
```

- **`enabled`** — whether the proxy fronts this server at all. Servers with it
  off are invisible to the proxy.
- **`host`** — the address the *proxy* dials to reach the backend. Usually
  `127.0.0.1`; the backend port comes from the server record's first port.
- **`forwarding`** — how the verified player identity reaches the backend:
  `"none"`, `"bungeecord"` or `"velocity"`.
- **`forwardingSecret`** — the Velocity modern-forwarding secret. Only read for
  `"velocity"`; leave it `null` otherwise.

Edit the block from Discord with `/mcserver edit` (it also covers the plugin/mod
directory and the IPC socket override). The proxy re-reads each server record, so
proxy changes apply to the next connection even while the server is running.

The backend port is the server record's first port, edited with `/manageserver
browse`. Nothing in the launch path passes that port to the JVM — the server
binds whatever `server-port` in its `server.properties` says — so the two have to
agree or the proxy dials a port nobody listens on. `/mcserver create` writes
`server-port` for a new server; for servers registered earlier, run
`bun tools/backfill-server-port.ts` (see `docs/MIGRATION.md`).

### ⚠️ Forwarding requires an unreachable backend

`bungeecord` and `velocity` both require the backend to run in **offline mode**
with the matching forwarding option enabled. A backend configured that way
believes whatever identity its incoming connection claims. If such a backend is
reachable from the internet, **anyone can connect to it as anyone** — including
your operators.

So, whenever `forwarding` is not `"none"`:

- bind the backend to loopback (`server-ip=127.0.0.1` in `server.properties`) or
  to a private interface the proxy shares, and
- firewall its port so nothing but the proxy can reach it.

Only the proxy's `MC_PROXY_LISTEN_PORT` should be open to the world.

### BungeeCord forwarding

In the backend's `server.properties`:

```properties
online-mode=false
server-ip=127.0.0.1
```

Then, depending on the server software:

- **Paper / Spigot** — set `settings.bungeecord: true` in `spigot.yml`. On modern
  Paper also set `proxies.bungee-cord.online-mode: true` in
  `config/paper-global.yml`.
- **Other forks** — enable their equivalent "BungeeCord compatibility" flag.

Finally set the server's `proxy.forwarding` to `"bungeecord"`.

### Velocity modern forwarding

In the backend's `server.properties`:

```properties
online-mode=false
server-ip=127.0.0.1
```

Then enable Velocity modern forwarding in the server software (Paper:
`proxies.velocity.enabled: true` and `proxies.velocity.secret: <secret>` in
`config/paper-global.yml`) and put the **same** secret in the server's
`proxy.forwardingSecret`, with `proxy.forwarding` set to `"velocity"`.

The secret is an HMAC key. Treat it like a password: anyone holding it can forge
identities against the backend.

### No forwarding

`"none"` needs nothing configured on the backend beyond turning its own
authentication off, in its `server.properties`:

```properties
online-mode=false
server-ip=127.0.0.1
```

Leaving `online-mode=true` makes the backend ask the proxy to authenticate a
player whose session has already been spent, and the join fails with
`backend "…" is in online mode` in the proxy log.

The proxy still authenticates every player against Mojang — it is the
online-mode authority either way — and replays the *verified* username to the
backend, so a cracked client cannot walk in as somebody else. The backend runs
in offline mode and names the player from that username.

Two things do not survive the trip: the player's real UUID, which an offline
server derives from the name instead, and their signed skin properties, which it
has nowhere to fetch. Heads and skins therefore fall back to the default. That is
a property of an unmodified offline server, not something the proxy can work
around — use `"velocity"` or `"bungeecord"` if you need either.

Discord links still resolve. `/link` run in game on such a backend is recorded
against the offline UUID, so the proxy reports both identities to the bot and the
bot matches on either. A player who links in game is recognised the next time
they arrive at the proxy, and can start servers from the connecting screen.

The backend must still be unreachable except from the proxy. It is in offline
mode, so anything that can open a TCP connection to it directly can claim any
name.

## The vote channel

When a player joins and the server they want is down, the bot either starts it
outright — if the linked Discord account holds the `startServer` permission — or
raises a normal start-approval poll, with the usual poll fee, approval count and
vote fees. That poll needs somewhere to go:

```
/proxy setchannel channel:#server-votes
/proxy clearchannel
/proxy status
```

`setchannel` and `clearchannel` require the `editSetting` permission. With no
channel configured, a join that would need a vote cannot raise one. The player
is still held, and somebody has to run `/startserver` on Discord for them, so
configuring a channel is strongly recommended if anyone without the
`startServer` permission is expected to play.

`/proxy status` shows whether the proxy is enabled, its listen port, the current
vote channel, and every proxied server with its forwarding mode and online state.

## Linking a new player

The proxy does **not** check whether a player has linked their Discord account.
Verification stays entirely where it was: `/link` on Discord, talking to the
running server's connector, exactly as before the proxy existed.

That is deliberate rather than an omission. `/link` needs a server to be running,
because the connector is what delivers the one-time code. If the proxy turned
unlinked players away, a new player could never reach the state in which linking
is possible. So an unlinked player is routed and held like anyone else, joins
when a server is up, and links from in game.

Two consequences worth knowing:

- **An unlinked player cannot start a server.** Starting is decided by a Discord
  account's permission and paid for with its credit, and there is no account to
  check or charge. They are still kept rather than refused, so if somebody else
  starts the server, or a vote passes, they are let in with everyone else. In the
  waiting room they are told this, and told to run `/link` on Discord; in a
  silent hold they cannot be told anything.
- **Whatever your connector does with unverified players in game, it still
  does.** The bot's own join callback reports a player as unverified exactly as
  it did before, so any restriction or kick your server applies is unchanged.
  The proxy has simply stopped adding a second gate in front of it.
