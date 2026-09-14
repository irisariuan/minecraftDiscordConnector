# Plugin architecture

The bot is a **game-agnostic server-management platform**. The core owns only
platform-wide concerns; every game-specific behaviour lives in a plugin.

## What the core owns

- Server record persistence, selection, access control, and generic process
  lifecycle (launch, terminate, force-terminate, status, port-conflict checks,
  console-output capture, cleanup).
- Settings, permissions, approval polls, credits/payments, ticket
  inventory/history, notifications, and Discord command infrastructure.
- Plugin discovery/loading and the typed extension contracts + registry.
- Generic persistence for server metadata (`Server.config` JSON), managed
  artifacts (`ServerArtifact`), and external identities (`IdentityLink`).

The core contains **no** hard-coded game assumptions — no `"minecraft"`,
`loaderType`, `apiPort`, REST endpoints, UUIDs, or fixed game-type list.

## The plugin boundary

Plugins import **only** from `plugins/api.ts` — never from `lib/**`. That module
exposes:

- `events` — subscribe to broadcast events (`commandCalled`, `settingsChanged`,
  `creditChanged`, `serverStatusChanged`, `serverCreated`). Plugins cannot emit.
- `data.request(channel, params)` — typed request/response channels for data
  access (`db:*` servers, `artifact:*`, `identity:*`, `permission:*`,
  `credit:*`, `settings:get`, `env:get`, `store:*`). No raw DB/env access.
- `createStore(namespace)` — a private, persistent key/value store.
- Pure helpers/UI components and the extension-contract types.

Authoring conventions (auto-discovered by glob):

- `*.game.ts` — default-exports a `GamePlugin` (loaded first, deterministically).
- `*.command.ts` — default-exports a `CommandFile` (a Discord slash command).
- `*.script.ts` — default-exports a `run()` function (startup side-effects,
  event subscriptions).

## Extension contracts

Defined in `lib/plugin/contract.ts` and re-exported from `plugins/api.ts`:

- **`GamePlugin`** — `{ id, displayName, runtimeIds, validateConfig,
  defaultConfig?, lifecycle?, capabilities?, bootstrap? }`.
- **`ServerLifecycle`** — overridable process hooks: `launch`, `terminate`,
  `forceTerminate`, `probeStatus`, `parseOutput`, `cleanup`. Any hook omitted
  falls back to a generic core default.
- **`ServerCapabilities`** — optional, capability-gated behaviours: `runCommand`,
  `listPlayers`, `getLogs`, `hasScheduledShutdown`, `cancelScheduledShutdown`,
  `linkIdentity`/`unlinkIdentity`, and the markers `managePackages` /
  `enforceSessionPayment`. A command declares `requiredCapabilities`; the core
  refuses to run it against a server whose plugin lacks them.
- **`ServerRuntimeContext`** — the only surface a hook sees: the server id, the
  generic config, the **validated** plugin config, a `process` handle
  (spawn/kill/isOnline/`sendConsoleInput`/output), and the plugin's store.

Registration is deterministic: duplicate plugin ids or duplicate runtime ids are
**rejected loudly** at load time; a server whose `pluginId` is not loaded raises
an actionable error rather than falling back to another game.

## Adding a second game plugin

Create `plugins/<game>/<game>.game.ts`:

```ts
import { defineGamePlugin, type ServerRuntimeContext } from "../api";
import { z } from "zod";

interface MyConfig { /* game-specific fields */ }

const schema = z.object({ /* … */ });

export default defineGamePlugin<MyConfig>({
  id: "mygame",
  displayName: "My Game",
  runtimeIds: ["mygame"],            // loader/runtime ids this plugin claims
  validateConfig: (raw) => {
    const parsed = schema.safeParse(raw);
    return parsed.success
      ? { ok: true, config: parsed.data }
      : { ok: false, error: parsed.error.message };
  },
  defaultConfig: () => ({ /* … */ }),
  lifecycle: {
    // Override only what differs from the generic defaults, e.g.:
    parseOutput: (line) => ({ timestamp: null, type: "unknown", message: line }),
    async terminate(ctx, { grace }) { /* graceful stop */ return { success: true }; },
  },
  capabilities: {
    async runCommand(ctx: ServerRuntimeContext, command) { /* … */ return { success: true, output: null }; },
    async listPlayers(ctx) { /* … */ return []; },
  },
  // Optional: create a default server from env when the DB is empty.
  bootstrap: () => null,
});
```

Then, as needed:

- Add `*.command.ts` files for game-specific Discord commands. Gate them with
  `features.requiredCapabilities` so they only run against your servers.
- Add `*.script.ts` for startup wiring (e.g. an inbound callback HTTP server —
  see `plugins/minecraft/callback.script.ts`).
- Track mods/packages via the generic `artifact:*` channels under your own
  `provider` string; store per-server state via `createStore` or the artifact
  metadata.
- Persist account links via the `identity:*` channels (`pluginId = "mygame"`).

**Interfaces to implement:** at minimum `GamePlugin.id` / `displayName` /
`runtimeIds` / `validateConfig`. Everything else is optional and defaults to
generic behaviour.

## Reference plugins

- `plugins/minecraft/` — the full Minecraft implementation (lifecycle, loader
  discovery, REST client, callback server, pay-to-play, OTP linking, commands).
- `plugins/modrinth/` — a package provider layered on the Minecraft plugin,
  tracking artifacts under `provider = "modrinth"`.
- `plugins/githubConnector/` — a standalone installer that tracks a GitHub
  release by tag and records it as a `provider = "github"` artifact.
- `plugins/cloudflare/` — a game-independent utility command.
