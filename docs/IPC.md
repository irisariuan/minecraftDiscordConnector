# Connector IPC

The bot and the in-JVM connector plugin
([discordMinecraftConnectorPlugin](https://github.com/irisariuan/discordMinecraftConnectorPlugin))
talk over a **Unix domain socket**, one per managed server. Neither side opens a
TCP port, and the socket is created with mode `0600`, so only the account that
runs both processes can drive a server console.

(This is the *connector* channel. The Minecraft proxy has its own, unrelated
control socket — see [PROXY.md](./PROXY.md).)

## Endpoint

The **bot listens**, the **plugin dials** and reconnects with backoff. When the
bot launches a server it passes the path in the environment:

| | |
|---|---|
| Environment variable | `CONNECTOR_IPC_SOCKET` |
| Default path | `connector.sock` in the server directory |
| Per-server override | `ipcSocket` in the server's Minecraft plugin config (absolute, or relative to the server directory) |

A server started by hand — outside the bot — falls back to the default path
relative to its own working directory, so the plugin still finds the socket as
long as the bot has that server registered and online.

Unix socket paths are capped at ~104 bytes by the OS, and some filesystems
(network shares in particular) cannot hold a socket node at all. Either case
needs the `ipcSocket` override pointed somewhere local and short — set it with
`/mcserver edit`; it is picked up the next time the server starts.

The bot opens a listener when it launches a server and closes it (unlinking the
socket) when the process exits. Servers that are already online when the bot
starts get their listener re-opened at boot, so a bot restart only detaches the
plugin for as long as its reconnect backoff.

## Framing

Newline-delimited JSON: one object per line, UTF-8, no embedded newlines. The
connection is symmetric — both sides send requests and answer them.

```text
→ {"t":"hello","v":1,"serverPort":25565,"platform":"paper","version":"1.0.0"}
← {"t":"welcome","v":1,"serverId":3}
← {"t":"req","id":"b1","method":"player.list","params":null}
→ {"t":"res","id":"b1","ok":true,"result":{"players":[{"name":"steve","id":"…"}]}}
→ {"t":"req","id":"p1","method":"player.verify","params":{"uuid":"…","playerName":"steve"}}
← {"t":"res","id":"p1","ok":true,"result":{"verified":true}}
```

- `hello` is the plugin's first frame; the bot answers with `welcome` and only
  then treats the connection as the server's live attachment. A second
  `hello` (a reconnect) supersedes the older connection.
- `id` is chosen by the sender and echoed back. Each side matches responses
  only against requests it sent, so the `b`/`p` prefixes are for readable
  traces, not correctness.
- A failed call answers `{"t":"res","id":…,"ok":false,"error":"…"}`.
- Requests time out after 10s (15s for `command.run`) and reject locally.
- `v` is the protocol version (currently `1`).

## Methods — bot → plugin

| Method | Params | Result |
|---|---|---|
| `ping` | — | `{}` |
| `command.run` | `{ command }` | `{ success, output, logger }` |
| `player.list` | — | `{ players: [{ name, id }] }` |
| `player.register` | `{ playerName? \| uuid?, otp }` | `{ uuid }` — delivers the OTP in-game |
| `player.markVerified` | `{ uuid }` | `{}` — lifts join restrictions |
| `logs.get` | — | `{ lines: [{ timestamp, type, message }] }` |
| `shutdown.schedule` | `{ tick }` | `{ success }` |
| `shutdown.cancel` | — | `{ success }` |
| `shutdown.status` | — | `{ scheduled }` |
| `components.list` | — | `{ components: [name] }` |

## Methods — plugin → bot

| Method | Params | Result |
|---|---|---|
| `player.verify` | `{ uuid, playerName }` | `{ verified }` |
| `player.play` | `{ uuid, playerName, onlineTime, disconnect? }` | `{ kick }` |
| `shutdown.requestCancel` | `{ uuid, playerName }` | `{ allowed, reason? }` |

The calling server is identified by the connection, so these payloads carry no
server port or id. Both sides' implementations live in
`plugins/minecraft/runtime/ipc.ts` (transport + method tables),
`plugins/minecraft/runtime/request.ts` (bot → plugin calls) and
`plugins/minecraft/runtime/callbacks.ts` (plugin → bot handlers).

## Upgrading from the HTTP API

The previous transport was an in-JVM HTTP server on `apiPort` (default 6001)
plus an inbound callback server on port 4002. Both are gone, along with the
plugin's `api-url` setting; a jar older than this change cannot attach.

- Install the matching connector plugin/mod build on every managed server.
- Drop `SERVER_API_PORT` from `.env` and stop publishing 6001 in Docker.
- `apiPort` left over in a stored `Server.config` is ignored. Servers get the
  default socket path unless you set `ipcSocket`.
- The bot and the Minecraft server must now share a filesystem — the bot can no
  longer drive a server on another host.

## Capability gating

A server whose connector plugin is not attached — not installed, still booting,
or crashed — reports the "unavailable" value for every call instead of throwing:
`listPlayers`/`getLogs` return null, `runCommand` returns `success: false`, and
`terminate` falls back to a grace timeout followed by a force-kill.
