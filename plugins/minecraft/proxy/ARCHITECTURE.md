# mcproxy — design

A Minecraft: Java Edition reverse proxy that fronts every managed server on one
exposed port. When the backend a player wants is down, the proxy holds the
player instead of refusing the connection, asks the bot to bring the server up,
and then joins them to it. The player never sees an error and is never kicked.

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
        ┌───────────┴───────────┐
   target is up              nothing up
        │                        │
   join backend            hold mid-login
   (forward identity,       (POST /start if linked, keep the client
    relay login,             alive, wait, then join backend)
    tunnel)
```

## Holding

A player waiting for a server is parked **in the login phase**. Nothing has been
sent to them past the encryption exchange, so the client sits on its own
connecting screen: no error, no kick, no prompt to reconnect. When the backend
comes up the proxy opens the backend connection, relays the real Login Success,
and the hold resolves into an ordinary join with nothing lost.

This is the whole reason the proxy does not build a holding world. A world would
let the proxy talk to the player, but it would also require sending a correct
registry set, tag set, dimension codec and chunk for every protocol version, all
of which change release to release and none of which degrade gracefully when
they are wrong. The login-phase hold needs no version-specific data at all, so
it is correct on every version from 1.13 to whatever ships next.

What it costs is the ability to say anything to a waiting player. The proxy
therefore acts for them rather than asking them: joining *is* the request to
start, and the bot applies the same permission and voting rules it would apply
to `/startserver` on Discord.

The proxy does not gate on whether a player has linked a Discord account.
Linking happens in game through `/link`, which needs a server to be running, so
refusing unlinked players here would make linking unreachable for anyone new.
They are routed and held like anyone else. The one thing they cannot do is ask
for a server to be started, because that is decided by a Discord account's
permission and paid for with its credit.

A client stalled mid-login disconnects itself after about thirty seconds of
silence, so the hold sends a login plugin message every ten seconds on a channel
no plugin claims. The vanilla client always answers such a message, which is all
the hold needs from it. The exchange is strict lock-step — send one, read its
answer, then wait — so at every moment the hold is idle the client has nothing
in flight, and the connection can be handed to the backend tunnel without a
stray packet landing in the middle of the backend's own login.

Login plugin messages arrived in 1.13. A client older than that cannot be held,
and is told so plainly instead of being left to time out.

## Choosing between servers

When several servers are running, the hostname the player connected with picks
one: point `survival.example.com` and `creative.example.com` at the same proxy
and the name they typed selects the destination. This is the only selection
mechanism that works during a login-phase hold, where nothing can be shown to
the client, and it happens to work identically on every client version.

Failing that, a running server is preferred over a stopped one, and the lowest
server id breaks any remaining tie — stable across reconnects rather than
arbitrary.

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
- `none` — nothing is forwarded. Only sane for a backend that does not care who
  anyone is.

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
| `internal/auth` | RSA keypair, Mojang server hash, `hasJoined` verification |
| `internal/control` | typed client for the bot's control API, with config polling |
| `internal/status` | server-list ping, modern and legacy |
| `internal/forward` | BungeeCord and Velocity player-info forwarding |
| `internal/route` | login state machine, hold, backend dial, tunnel |
| `cmd/mcproxy` | flags, env, listener, graceful shutdown |

The proxy has no third-party dependencies; everything is standard library.

## Known limitations

- **A waiting player cannot be sent messages.** See "Holding" above for why.
  Giving them chat and commands means building a holding world, which means
  shipping and maintaining per-version registry data.
- **An unlinked player with no server running waits indefinitely.** They cannot
  raise a start request themselves, and nothing can be shown to them, so unless
  somebody else brings a server up they will sit on the connecting screen.
- **Clients older than 1.13 cannot be held**, only routed to a server that is
  already running.
- **`publicHost` in the control API is currently unused** by the proxy. It exists
  for a future hand-off that moves a player between backends mid-session.
- **The proxy has never been run against a real Minecraft client.** The login
  path, the hold and the tunnel are covered end to end by tests that perform a
  genuine RSA and AES-CFB8 exchange over real sockets, and the Login Start
  layouts are probed against the compiled binary for eight protocol versions.
  That is not the same as a vanilla client, which is the one thing still to do.
- **The indefinite hold is the least verified claim in the design.** That the
  vanilla client answers every login plugin request is documented; that doing so
  every ten seconds keeps it on the connecting screen *forever* is inferred from
  Netty read-timeout semantics. If a client turns out to have a separate hard
  login cap that inbound traffic does not reset, long holds will end in a client
  side "timed out" rather than a join. Test a real client past 30s, 60s and 5
  minutes before relying on it.
