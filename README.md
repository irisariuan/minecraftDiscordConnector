# Discord Server Manager

A modular, **multi-game** Discord bot for managing game servers, including
process lifecycle control, mod/package management, permission-based access,
credits, approvals, and a web UI for uploading custom files. Built with
[discord.js](https://discord.js.org/), [Bun](https://bun.sh/),
[Astro](https://astro.build/), and [Prisma](https://prisma.io/).

The **core** is game-agnostic — server records, generic process lifecycle,
settings, permissions, credits, tickets, approvals, and plugin infrastructure.
All game-specific behaviour lives in **plugins**. Minecraft is one such plugin
(`plugins/minecraft/`); adding another game means adding another plugin without
touching the core. See **[docs/PLUGINS.md](docs/PLUGINS.md)**.

Documentation:

- **[docs/PLUGINS.md](docs/PLUGINS.md)** — the plugin architecture and how to add a game.
- **[docs/PROXY.md](docs/PROXY.md)** — the Minecraft proxy: setup, forwarding and server selection.
- **[docs/MIGRATION.md](docs/MIGRATION.md)** — upgrading an existing install to multi-game.
- **[DOCKER.md](DOCKER.md)** — running the bot in Docker.

> **Upgrading an existing install?** Follow **[docs/MIGRATION.md](docs/MIGRATION.md)**
> to run the data-preserving multi-game migration (back up first).

## Features

- **Server Control**: Start, stop, suspend, and resume the Minecraft server via Discord commands.
- **Minecraft Proxy**: One public port in front of every managed Minecraft server. A player who connects while their server is down is kept instead of refused, in an empty waiting room where they can see what is available and type `/join` to start one — under the same rules `/startserver` uses, a direct start if they are permitted and otherwise a start vote in Discord. Connecting by itself starts nothing. See **[docs/PROXY.md](docs/PROXY.md)**.
- **Plugin Management**: Search, append, and delete plugins using Modrinth API; upload custom plugins via Discord or web UI.
- **Approval System**: Sensitive actions (like server start/stop) can require multi-user approval.
- **Permission System**: Fine-grained user and role permissions for all commands.
- **DNS Management**: Update Cloudflare DNS records to match the server's public IP.
- **Player Info**: List online players and view server logs.
- **Credit System**: Users spend and transfer credits for privileged actions; stored in PostgreSQL database.
- **Pagination**: Paginated responses for long lists (logs, plugins, players).
- **Web UI**: Astro-based interface for uploading custom plugins with drag-and-drop support.
- **Database Integration**: Uses Prisma with PostgreSQL for persistent storage of users, credits, and transactions.

## Requirements

- [Bun](https://bun.sh/) runtime
- Node.js v18+
- PostgreSQL database
- Discord bot token and application
- Minecraft server (with the connector plugin installed; it attaches over a
  Unix socket, see [docs/IPC.md](docs/IPC.md))
- Cloudflare API key (for DNS updates)
- Modrinth-compatible Minecraft server (for plugin management)

## Setup

1. **Clone the repository:**

    Follow GitHub instructions to clone the repository.

2. **Install dependencies:**

    ```sh
    bun install
    cd webUi
    bun install
    cd ..
    ```

3. **Set up the database:**
    - Create a PostgreSQL database.
    - Run Prisma migrations:

        ```sh
        npx prisma migrate deploy
        npx prisma generate
        ```

4. **Build the web UI:**

    ```sh
    cd webUi
    bun run build
    ```

5. **Configure environment variables:**
   Create a `.env` file with the following (see `.gitignore` for sensitive files):

    ```env
    # ── Core (required, game-agnostic) ─────────────────────────────
    TOKEN=your_discord_bot_token
    CLIENT_ID=your_discord_client_id
    DATABASE_URL=postgresql://username:password@localhost:5432/database_name
    UPLOAD_URL=https://your-domain.com # URL for the web UI upload server

    # ── Cloudflare plugin (optional) ───────────────────────────────
    CF_KEY=your_cloudflare_api_key
    UPDATE_URL=https://api.cloudflare.com/client/v4/zones/ZONE_ID/dns_records/RECORD_ID

    # ── Minecraft plugin (optional) ────────────────────────────────
    # Only used by the Minecraft plugin to bootstrap a default server
    # when the database is empty. Not read by the core.
    SERVER_DIR=/path/to/minecraft/server
    MINECRAFT_VERSION=1.21.4 # or your server version
    LOADER_TYPE=paper        # or your server type
    MOD_TYPE=plugin          # or your mod type
    SERVER_PORT=25565        # optional (default 25565)
    SERVER_TAG=Default Server # optional display tag

    # ── Minecraft proxy (optional) ─────────────────────────────────
    # Off unless MC_PROXY_ENABLED is true-ish. See docs/PROXY.md.
    MC_PROXY_ENABLED=false
    MC_PROXY_LISTEN_PORT=25565 # public Minecraft port
    MC_PROXY_IPC_PATH=data/mcproxy.sock # control socket (IPC)
    MC_PROXY_PUBLIC_HOST=mc.example.com # only if the client's own address is unroutable
    MC_PROXY_BIN=plugins/minecraft/proxy/bin/mcproxy
    MC_PROXY_WORLD_CACHE=data/mcproxy-worlds # recorded worlds; safe to delete
    MC_PROXY_TOKEN=           # optional; random per start when unset
    ```

    The proxy binary is built separately with `bun run build:proxy` (Go
    required); the Docker image builds it for you.

    The core needs none of the Minecraft variables. They belong to the
    Minecraft plugin's env-based bootstrap; see
    [docs/PLUGINS.md](docs/PLUGINS.md) and [docs/MIGRATION.md](docs/MIGRATION.md).

6. **Register Discord commands:**

    ```sh
    bun tools/register.ts
    ```

7. **Start the bot:**

    ```sh
    bun run start
    ```

    This runs `plugins/launcher/launcher.ts`, which keeps the bot attached to
    your terminal and re-spawns it in place when you use `/launcher restart`.
    Run `bun index.ts` directly if you do not want in-place restarts.

8. **Optional: Give permission to admin account in Discord**

    You may want to give your admin account permission to use the bot (such that you could later edit permission through Discord). You can do this by running the following command:

    ```sh
    bun tools/editPerm.ts
    ```

9. **Recommended: Add your server record to the database**
   You may want to add your Minecraft server record to the database. You can do this by running the following command:

    ```sh
    bun tools/newServer.ts
    ```

## Usage

All commands are available as Discord slash commands. Some require specific permissions or multi-user approval. Some actions (like running commands, viewing others' info) may cost credits.

### Server Management Commands

- `/startserver [force]` — Start the server. Use `force` to bypass approval if you have permission
- `/stopserver [seconds] [force]` — Stop the server. Optional `seconds` parameter for delayed shutdown
- `/cancelstopserver` — Cancel a scheduled server shutdown (may require approval)
- `/suspend` — Temporarily suspend the server (requires permission)
- `/unsuspend` — Resume a suspended server (requires permission)
- `/status` — Check if the server is online or offline
- `/runcommand command [poll] [timeout] [capture]` — Execute a command on the server
  - `command`: The command to run (required)
  - `poll`: Set to false to force execution if you have permission
  - `timeout`: Approval timeout in milliseconds (100-60000)
  - `capture`: Output capture duration in milliseconds (1000-60000)

### Plugin Management Commands

- `/searchplugin plugin` — Search for plugins on Modrinth
- `/appendplugin plugin` — Download and install a plugin from Modrinth
- `/deleteplugin plugin` — Remove a plugin from the server
- `/uploadplugin` — Upload a custom plugin (via Discord attachment or web UI)
- `/getactiveplugins` — List currently active plugins

### Monitoring Commands

- `/log [filter]` — View server logs with optional filtering (paginated)
- `/players` — List currently online players (paginated)
- `/refreshdns` — Update Cloudflare DNS record with current server IP

### Minecraft Proxy Commands

- `/proxy status` — Show whether the proxy is enabled, its listen port, the vote channel, and every proxied server
- `/proxy setchannel channel` — Set the channel in-game start votes are posted to (requires `editSetting`)
- `/proxy clearchannel` — Stop posting in-game start votes (requires `editSetting`)

### Bot Maintenance Commands (launcher plugin)

- `/launcher status [fetch]` — Show the bot's branch, commit, ahead/behind vs. remote, and working-tree state
- `/launcher branches` — List local and remote branches
- `/launcher switch target [pipeline]` — Check out another **branch, tag or commit** (runs `bun install` if dependencies changed, and the version pipeline unless `pipeline:false`)
- `/launcher pull [pipeline]` — Fast-forward the current branch to its remote
- `/launcher pipeline [action]` — List the version pipeline's steps, or `apply`/`unapply` them by hand
- `/launcher restart [force]` — Stop game servers and restart the bot in the same terminal (requires starting via `bun run start`)

#### The version pipeline

A checkout only moves files. Anything a version needs *done* — compiling a
binary, applying migrations, rebuilding the web UI — goes in
`.launcher/pipeline/` as numbered steps:

```
.launcher/pipeline/10-install.sh
.launcher/pipeline/20-build.sh
.launcher/pipeline/30-migrate.ts
```

Each file is one step and handles both directions: it is called with `apply`
or `unapply` as its first argument. `/launcher switch` and `/launcher pull`
run the pipeline around the checkout:

1. **unapply** the version being left, in reverse filename order, *before* the
   checkout — so each step is torn down by its own version's code, while that
   code is still in the working tree;
2. move the checkout (and `bun install` if the dependency manifest changed);
3. **apply** the new version's steps, in ascending filename order.

The directory is optional: with no `.launcher/pipeline/`, every launcher
command behaves exactly as it did before. `*.ts`/`*.js` steps run under bun,
`*.sh` under bash, anything else needs its own executable bit and shebang;
`*.md` files are ignored, so the directory can document itself.

Steps see the move in their environment: `LAUNCHER_PIPELINE_MODE`,
`LAUNCHER_PIPELINE_STEP`, `LAUNCHER_REASON` (`switch`/`pull`/`manual`),
`LAUNCHER_FROM_REF`, `LAUNCHER_TO_REF`, `LAUNCHER_FROM_SHA`, `LAUNCHER_TO_SHA`.

A run stops at the first failing step and reports which ones had already run;
nothing is rolled back automatically, so **write steps to be idempotent**. A
failed *unapply* aborts the switch entirely — nothing is checked out — rather
than stranding the host between two versions. A failed *apply* leaves the
checkout on the new version with the pipeline half-applied; fix the step and
re-run `/launcher pipeline action:apply`. Steps have a 10-minute timeout each.

Because the launcher tracks what is applied rather than what is on disk,
`unapply` still runs steps that only existed on the version being left behind.

This repository ships one step, `20-build-proxy.sh`: it compiles the Go
Minecraft proxy on apply and deletes `plugins/minecraft/proxy/bin/` on unapply.
The binary is gitignored build output, so a checkout neither brings it nor
takes it away — without the step, switching between versions whose proxy
sources differ would silently keep running the previous version's binary. On a
version with no proxy sources the step is a no-op, and on a host without Go it
fails loudly rather than leaving a stale binary in place.

### Permission System Commands

- `/getperm [user] [local]` — View permissions for yourself or another user
  - `user`: Target user (optional, costs credit if not yourself)
  - `local`: Whether to check server-specific permissions
- `/editperm` — Modify user or role permissions (requires permission)

### Credit System Commands

- `/transfercredit user amount` — Transfer credits to another user
  - `user`: Recipient user (required)
  - `amount`: Amount to transfer (minimum 1)
- `/changecredit` — Set or modify user credits (requires permission)
- `/credithistory` — View your credit transaction history

### Configuration Commands

- `/settings` — View or modify bot settings
  - Subcommands: `get` (view settings) or `set` (modify settings)
  - Options for global vs server-specific settings
  - Separate credit and approval settings

### File Management Commands

- `/editfile` — Edit server files (requires permission, feature in development)

## Permissions

Permissions are managed via `/editperm` and stored in the PostgreSQL database. See `lib/permission.ts` for all available permission flags.

- **Grant or remove permissions** to users or roles using `/editperm`.
- **Credit system**: Some actions (like running commands, viewing others' info, uploading plugins) cost credits. Admins can set or change credits with `/changecredit`.

## Development

- TypeScript project, configured for Bun and ESNext.
- **Architecture**: a game-agnostic core plus game plugins. Core commands are
  auto-loaded from `commands/`; plugins live in `plugins/<name>/` and are
  discovered by glob (`*.game.ts`, `*.command.ts`, `*.script.ts`). Plugins
  import only from `plugins/api.ts`. See **[docs/PLUGINS.md](docs/PLUGINS.md)**
  for the extension contracts and how to add a second game.
- Database schema managed with Prisma; run `bunx prisma studio` to view data.
  For the multi-game upgrade see **[docs/MIGRATION.md](docs/MIGRATION.md)**.
- Web UI built with Astro; source in `webUi/` directory.
- Scripts: `bun run typecheck`, `bun run test`, `bun run migrate`.
- See `lib/` for core logic and `lib/plugin/` for the extension contracts + registry.

## License

Private project. Permitted for personal use only.
