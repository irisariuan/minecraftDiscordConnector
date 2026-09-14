# The Minecraft proxy

The proxy is an optional Go program (`plugins/minecraft/proxy/`) that fronts
every managed Minecraft server on **one** exposed port. Players always connect to
the same address; the proxy works out which backend they want and routes them
there.

Its real purpose is what happens when that backend is **down**. Instead of
refusing the connection with "Can't connect to server", the proxy *holds* the
player and gives them a way to bring the server up — immediately if they are
allowed to, otherwise by raising a start vote in Discord.

The proxy owns no database, no Discord connection and no credentials. It is a
child process of the bot and asks the bot for every decision over a **Unix
domain socket** (`plugins/minecraft/proxy/CONTROL_API.md`). Nothing about that
channel touches the network: there is no port to firewall, and access is decided
by filesystem permissions on the socket, which the bot creates mode 0600.

## How holding works

The proxy is the online-mode authority: it performs the encryption handshake and
verifies the player against Mojang itself. The backends behind it run in offline
mode and trust the identity the proxy forwards to them.

A player waiting for a server is parked **in the login phase**. Nothing has been
sent to them past the encryption exchange, so their client sits on its own
connecting screen: no error, no kick, no prompt to reconnect. When the backend
comes up, the proxy opens the backend connection, relays the real Login Success,
and the hold resolves into an ordinary join with nothing lost.

The proxy does not build a holding world to chat with waiting players. A world
would need a correct registry set, tag set, dimension codec and chunk for every
protocol version, all of which change release to release and none of which fail
gracefully when they are wrong. The login-phase hold needs no version-specific
data at all, so it is correct on every version from 1.13 onwards, including
versions that have not shipped yet.

What that costs is the ability to say anything to a waiting player. The proxy
therefore acts for them instead of asking them: **joining is the request to
start**. The bot applies exactly the rules it would apply to `/startserver` on
Discord — an immediate start for a linked account holding the `startServer`
permission, and otherwise a start-approval poll with the usual fees and counts.

A client stalled mid-login gives up after about thirty seconds of silence, so
the hold sends it a login plugin message every ten seconds on a channel no
plugin claims. The vanilla client always answers such a message, which is all
the hold needs. Login plugin messages arrived in **Minecraft 1.13**; a client
older than that cannot be held and is told so plainly rather than left to time
out. It can still be routed to a server that is already running.

### Before you rely on long holds

The hold keeps a client alive by sending it a login plugin message every ten
seconds, which the vanilla client always answers. That the client then waits
*indefinitely* follows from how its read timeout works, but it is inferred
rather than documented, and no Mojang documentation rules out a separate hard
cap on how long a login may take.

So before you depend on this, test it: join while a server is down and stay
there past 30 seconds, past a minute, and past five minutes, on the oldest and
newest client versions your players use. If a client gives up with "timed out",
the hold is not working for that version and players should be told to start
servers from Discord instead.

### A waiting player is never kicked

That holds even when the vote fails. A rejected or expired poll leaves the
player exactly where they were, connected and waiting, free to disconnect and
try again whenever they like. The proxy does **not** re-raise a poll on their
behalf, because that would charge the poll fee again and spam the channel. If a
vote fails, someone has to ask again — on Discord, or by rejoining.

Because nothing can be displayed during a hold, a player whose vote failed sees
no explanation in game. They will sit on the connecting screen until they give
up. Tell your players that, or keep an eye on the vote channel for them.

## Choosing between servers

When more than one server is running, the **hostname the player connected with**
selects the destination. Point several names at the proxy:

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

This is the only selection mechanism that works during a hold, and it works on
every client version. It also selects which server a player's join *starts* when
everything is down.

With no hostname match, the proxy prefers any server that is already running,
and falls back to the lowest server id. That is stable across reconnects rather
than arbitrary, but if you run more than one server you should set up the
hostnames — otherwise players cannot express a preference at all.

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
| `MC_PROXY_PUBLIC_HOST` | *(empty)* | Address players use to reach the proxy. Reserved: it is reported to the proxy but not yet acted on, and exists for a future hand-off that moves a player between backends mid-session. |
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

With `"none"` the backend just sees the proxy's connection and no identity is
passed. Only sensible for a backend with no per-player identity requirements.

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

Unlinked players cannot join: the bot removes them from a running server anyway,
so the proxy stops them at the door where it can still explain itself. It does
more than explain — it hands them the code they need.

A player who has never linked their account is disconnected with a message like:

```
Your Minecraft account is not linked to Discord yet.

Run /linkcode 481920 on Discord within 5 minutes, then join again.
```

The code is **six digits, single use, and expires after five minutes**. Pending
codes live in the bot's memory only; nothing is written to the database until
the link is actually made. On Discord the player runs:

```
/linkcode code:481920
```

and their Minecraft account is linked to the Discord account that ran the
command. `/unlink` removes the link as usual. Asking for a code for an account
that is already linked is refused.

This works on every client version, because a login-phase disconnect message is
the one thing every Minecraft client since 1.7 will display.

Note that this route and the Discord `/link` command are two independent ways to
reach the same result. `/link` on Discord talks to a **running** server's REST
API to deliver an in-game one-time password, so it only works while that server
is up. The proxy route is the one that works while everything is down, which is
exactly when a new player first arrives.
