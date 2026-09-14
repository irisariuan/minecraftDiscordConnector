# mcproxy — design

A Minecraft: Java Edition reverse proxy that fronts every managed server on one
exposed port. When the backend a player wants is down, the proxy keeps them
rather than refusing the connection: it puts them in an empty world where they
can see what is available and ask for one to be started. They are joined to it
when it comes up, and are never shown an error or disconnected.

Connecting starts nothing by itself. A server is started because somebody asked
for it — in the waiting world, or on Discord — and never as a side effect of a
player turning up.

The proxy owns no database, no Discord connection and no credentials.
Everything it needs comes from the bot over a Unix domain socket, speaking the
small HTTP API described in `CONTROL_API.md`. There is no listening port for
that channel, so it is reachable only by a process that can open the socket file.

## Connection flow

```
client ──► first byte 0xFE ──► legacy pre-1.7 ping, answered and closed
        └─ handshake
             ├─ next state 1 ──► status: synthesized MOTD, never proxied
             └─ next state 2 or 3 ──► login
                    │
   encryption request ──► shared secret ──► Mojang hasJoined
   (the proxy is the online-mode authority; backends run offline + forwarding)
                    │
             POST /session ──► who is this, what may they use
                    │
     ┌──────────────┼──────────────────────┐
 one server,    not linked yet,        no world to
 already up,    or a choice to         offer them
 and linked     make                        │
     │               │                      │
 join backend   waiting world           hold mid-login
 (forward        (empty room, chat,      (POST /start if linked,
  identity,       /link, /start,          keep the client alive,
  relay login,    /join, then a           wait, then join backend)
  tunnel)         transfer back
                  through the front
                  door)
```

## Waiting

A player whose server is down has to wait somewhere, and there are two places to
do it. Which one they get is decided by whether the proxy can build a world for
their client version; nothing else about the two paths differs, and in neither
is the player ever disconnected.

### The waiting world

An empty room with no floor, served by the proxy itself. There is no terrain, no
chunk is ever sent, and the player floats in the void with flying forced on and
damage off. What it buys is a conversation: the proxy can finally say what it is
waiting for, and the player can answer.

The room is deliberately empty. Everything a world might contain is
version-specific data the proxy would then have to keep correct for releases
that do not exist yet; nothing is sent beyond what a client insists on before it
will enter the play phase at all. The player is placed below the bottom of the
world, which is what makes a chunkless world legal: a client will not leave its
loading screen until it is either standing in a chunk or outside the world
vertically.

Inside, `/join <server>` moves the player to a destination that is already up,
`/start <server>` asks for a stopped one to be brought up, `/link <discord name>`
connects a Discord account, `/servers` reprints the list and `/help` explains.
Joining and starting are deliberately separate verbs: a start spends credit or
posts a vote where other people can see it, and neither should follow from
mistyping a name at the command for moving. Plain chat is accepted as well as
commands, because a player who cannot work out why nothing is happening will try
typing without a slash. Names resolve by tag, by slug, by
id or by an unambiguous prefix: there is no command tree declared, so there is no
tab completion to lean on. That is a deliberate omission — declaring one means
sending an argument parser id that has moved between versions, and the packet is
not worth the risk when the client sends the command either way.

Leaving the room is a **transfer**, not a hand-over. The proxy tells the client
to reconnect to the address it originally used, having first stored the choice
in a cookie, and the second connection is an ordinary login down the path every
other player takes. Nothing about forwarding, compression or identity needs a
second implementation, and the client is never returned to its server list.
Cookies survive a transfer and nothing else, which is exactly the lifetime a
choice made ten seconds ago should have.

### The mute hold

Where no world can be built, a player is parked **in the login phase** instead.
Nothing has been sent to them past the encryption exchange, so the client sits
on its own connecting screen: no error, no kick, no prompt to reconnect. When the
backend comes up the proxy opens the backend connection, relays the real Login
Success, and the hold resolves into an ordinary join with nothing lost.

What it cannot do is say anything, and it cannot ask anything either — which is
why nothing is started on such a player's behalf. Starting a server has a cost
attached, in permission and in credit, and a player who cannot be told that a
decision is being made for them has not made it. A held player waits for somebody
who can: another player in the waiting world, or somebody on Discord.

A client stalled mid-login disconnects itself after about thirty seconds of
silence, so the hold sends a login plugin message every ten seconds on a channel
no plugin claims. The vanilla client always answers such a message, which is all
the hold needs from it. The exchange is strict lock-step — send one, read its
answer, then wait — so at every moment the hold is idle the client has nothing
in flight, and the connection can be handed to the backend tunnel without a
stray packet landing in the middle of the backend's own login.

Login plugin messages arrived in 1.13. A client older than that cannot be held,
and is told so plainly instead of being left to time out.

### Linking

Everything the proxy decides about a player is decided against a Discord
account: which servers they may use, whether they may start one, what it costs.
Somebody without one therefore has nothing that can be resolved, so they go to
the waiting world ahead of every other consideration — ahead of a hostname, and
ahead of a choice they made a moment ago — and can type nothing there but
`/link`.

`/link <discord name>` runs the ordinary one-time-code exchange with its two
halves swapped: the bot messages the named Discord account, and the code is
shown **in game**, where only whoever holds the Minecraft account can read it.
It exists because the Discord-side `/link` needs a server to be running — the
connector plugin is what puts the code on screen there — which would leave a new
player arriving to find everything down with no way in at all.

Settling it takes a person reading a direct message, so `POST /link` returns as
soon as there is a code to show and the outcome arrives on a later `POST
/session`, in its `linkRequest` field. A confirmed link is written against both
identities the player can be known by, since a `forwarding: none` backend knows
them by the offline one.

The gate applies only where a world can be built. A client that cannot be shown
one cannot be told anything either, so it keeps the old precedence and links the
old way — refusing it would make linking unreachable for exactly the players who
most need it explained.

## Recording a world

The proxy does not author registry data. It records it.

Before a modern client will enter the play phase it demands a registry set: the
dimension types, biomes, damage types, painting variants and a couple of dozen
other tables describing the world it is about to be shown. The list grows with
every release — eight tables at 1.20.5, twenty-nine at the time of writing —
several entries must match vanilla names exactly, and a client that finds one
missing or unbound does not degrade. It disconnects, at the moment the
configuration phase ends.

Every other limbo implementation ships that data, per version, tens of kilobytes
at a time, and each of them breaks when a release adds a table it had not heard
of. The documented shortcut — naming entries without their contents and letting
the client fill them in — is not available to a proxy, because it depends on
telling the client which *game* version's data to load, and a handshake carries
only a protocol number. One protocol number covers both 1.21.7 and 1.21.8, whose
data differ.

So the proxy takes one from a real server. There are two ways it does that, and
it prefers the first.

**Watching a join.** When anybody joins a running backend, the proxy writes down
the configuration phase that backend sent them, along with its Login (play)
packet. Such a recording is correct by construction: every byte came from the
very server those players are going to, at the very version they are running.

**Fetching one.** Watching a join only works when somebody is joining, and the
waiting world is needed precisely when nobody can. Since connecting no longer
starts anything, a proxy that had never seen a join would have no way out of
that state at all. So it goes and gets one: it asks a running backend for its
server-list entry to learn which version it speaks, logs in, walks the
configuration phase, and hangs up.

Hanging up is the point. A backend puts a player into the world at the moment it
sends Login (play), so stopping short of that means no join message, no entry in
the player list, and nothing for a connector plugin to report — nobody sees it
happen. The price is that the Login (play) packet must then be composed from a
documented layout rather than copied, which is the one piece of per-version
packet construction in the whole design. A world built this way is marked as
such, and the first real join at that version replaces it with the genuine
article.

Two details make the recording trustworthy:

- **The client's known-packs reply is emptied on the way past.** Left alone, the
  backend would omit the contents of every entry both sides already had, and the
  recording would be full of holes that only resolve for a client with exactly
  that local data. Answering "I have nothing" costs that one player a larger
  registry set and makes the recording self-contained.
- **A recording is discarded unless that rewrite is confirmed.** If the client
  side of the configuration phase was not seen through to its acknowledgement,
  an un-emptied reply may have reached the backend, and a hollow recording looks
  perfectly healthy right up until it disconnects whoever it is replayed to.

Two more recordings are thrown away rather than kept, both for the same reason:
a stored one stops the next join being watched, so a bad recording does not
merely fail once, it takes that version out of service for a day. One is a
configuration phase that carried no registry data at all. The other is one
holding a packet too large to send back — the backend link is usually
compressed and the waiting world's is not, so a frame that arrived comfortably
can be one the proxy could never replay.

Recordings are re-taken after a day, because a data pack, a mod or a game update
changes what a backend sends and nothing here can detect that.

Either way a world is filed the moment it exists rather than when the session
that produced it ends, so everybody arriving behind benefits immediately.

What remains is a window rather than a cold start: between a server first coming
up and the proxy noticing, there is no world for that version. The proxy looks
every forty-five seconds and on startup, so the window is under a minute, once.

## Choosing between servers

In order of how deliberate the choice is:

1. **A cookie**, left by the waiting world moments earlier. It is checked against
   the bot's answer for this login rather than trusted — it lives on the client,
   where a player can edit it — and it expires in two minutes, so a player
   reconnecting tomorrow is asked afresh rather than sent wherever they went
   last time.
2. **The hostname** they connected with. Point `survival.example.com` and
   `creative.example.com` at the same proxy and the name they typed selects the
   destination. It works identically on every client version, and it is the only
   mechanism available during a mute hold.
3. **The waiting world**, where they are asked.
4. **Failing all of that** — a client too old for a world, or a version with no
   recording — a running server is preferred over a stopped one, and the lowest
   server id breaks the remaining tie.

A player with one server that is already running is never asked anything: there
is no decision to make, and an empty room in front of a join nobody needed to
think about would be a worse experience than the one they had before.

## Routing and forwarding

The backend never sees the player's real connection, so it cannot authenticate
them. The proxy authenticates instead and passes the verified identity down
using whichever scheme the backend is configured for:

- `bungeecord` — the verified IP, UUID and signed profile properties are
  appended to the handshake's server-address field. Works on every Spigot
  derivative and on every protocol version. It carries no signature, so the
  backend **must** be unreachable except from the proxy.
- `velocity` — the backend asks over a login plugin message and the proxy answers
  with an HMAC-signed payload. Forgery requires the secret, so this is the safer
  choice where the backend supports it.
- `none` — nothing is forwarded, and no backend configuration is needed. The
  backend runs offline and names the player from the username the proxy replays,
  which the proxy has verified with Mojang, so the *name* is as trustworthy as
  under any other mode. What the backend cannot learn is the player's real UUID
  or their signed skin properties: an offline server derives the UUID from the
  name and has nowhere to get textures from. The proxy therefore also tells the
  bot the offline UUID that backend will use, so a Discord link made in game
  under that identity still resolves when the same player next arrives at the
  proxy (see `POST /session` in `CONTROL_API.md`).

After the backend's Login Success is relayed, both links share one compression
threshold, because the proxy forwards the backend's Set Compression verbatim.
The rest of the session is then a raw byte copy through the client's stream
cipher rather than a packet-by-packet re-encode.

## Packages

| package | responsibility |
| --- | --- |
| `internal/protocol` | varints, field codecs, packet framing, compression, CFB8 stream cipher |
| `internal/nbt` | the small slice of network NBT the proxy needs |
| `internal/mcver` | the protocol-version thresholds everything else branches on |
| `internal/limbo` | the waiting world: recorded worlds, the play-phase session, per-version packet numbering |
| `internal/text` | legacy § codes into real text components, as JSON or as NBT |
| `internal/auth` | RSA keypair, Mojang server hash, `hasJoined` verification |
| `internal/control` | typed client for the bot's control API, with config polling |
| `internal/status` | server-list ping, modern and legacy |
| `internal/forward` | BungeeCord and Velocity player-info forwarding |
| `internal/route` | login state machine, hold, backend dial, tunnel |
| `cmd/mcproxy` | flags, env, listener, graceful shutdown |

The proxy has no third-party dependencies; everything is standard library.

## Known limitations

- **A world exists only for versions the proxy has seen a server speak.** It
  fetches one from each running backend within a minute of that backend coming
  up, and records one from any join, so in practice this settles itself. But a
  version no managed server has ever run — a player on a client newer or older
  than every backend — has no world, and gets the mute hold.
- **Nothing starts a server except somebody asking.** A player held mutely
  cannot ask, so they wait for another player in the waiting world or for
  somebody on Discord. That is deliberate: a start costs permission and credit,
  and it should not be spent by somebody who was never told it was being spent.
- **Three client versions have no waiting world at all**, whatever has been
  recorded: 1.21.11 and 26.1 have no published packet numbering, and anything
  newer than 26.2 is unknown by definition. They are held instead. Adding a
  version is a row in `internal/limbo/versions.go`, and should only be added
  from a source, never by interpolation.
- **A held player cannot be sent messages.** That is the difference between the
  two ways of waiting, and the whole reason the world exists.
- **An unlinked player held mutely waits indefinitely.** They cannot raise a
  start request, because that needs a Discord account's permission and credit,
  and they cannot be shown `/link` either, so they sit on the connecting screen
  until somebody else brings a server up. In the waiting world neither is true:
  they can link on the spot and start a server as soon as they have.
- **Linking in game needs a Discord username the bot can see.** Usernames are
  unique across Discord but nothing exposes a global lookup by one, so the
  search runs over the guilds the bot is in. Somebody sharing no guild with the
  bot is reported as not found — which is the right answer, since the bot would
  have no way to message them either.
- **Clients older than 1.13 cannot be held**, only routed to a server that is
  already running.
- **No tab completion in the waiting world.** The command tree is not declared,
  so a typed `/join` or `/start` shows red in the chat box before it is sent. Declaring one
  means sending an argument parser id that has moved between versions, and a
  malformed tree disconnects the player — a worse trade than an ugly chat box,
  given the command is sent either way.
- **Real UUIDs and skins need a forwarding mode.** With `none` the backend
  assigns the offline UUID for the verified name and sees no profile
  properties, so player heads and skins fall back to the default. No amount of
  proxy-side work changes that: an unmodified offline server derives the UUID
  itself and never asks anyone about textures. Use `velocity` or `bungeecord`
  where the backend supports it.
- **`publicHost` is only a fallback.** A transfer is aimed at the address the
  client itself used, which is the one address known to work for it; the
  configured public host is used only when the handshake carried nothing usable.
- **The proxy has never been run against a real Minecraft client.** The login
  path, the hold, the tunnel, the recording and the whole waiting-world sequence
  are covered end to end by tests over real sockets, with a genuine RSA and
  AES-CFB8 exchange, and the Login Start layouts are probed against the compiled
  binary for eight protocol versions. None of that is the same as a vanilla
  client, which remains the one thing still to do. In particular these tests
  cannot tell you whether a real client accepts a replayed registry set — only
  that the proxy sends what it believes it is sending.
- **The indefinite hold is the least verified claim in the design.** That the
  vanilla client answers every login plugin request is documented; that doing so
  every ten seconds keeps it on the connecting screen *forever* is inferred from
  Netty read-timeout semantics. If a client turns out to have a separate hard
  login cap that inbound traffic does not reset, long holds will end in a client
  side "timed out" rather than a join. Test a real client past 30s, 60s and 5
  minutes before relying on it. The waiting world is not exposed to this: it
  keeps the connection alive with ordinary play-phase keep-alives, which are
  documented to work indefinitely.
