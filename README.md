# Discord Minecraft Linkage

A Discord bot for managing a Minecraft server, including plugin management, server control, DNS updates, permission-based access, and a web UI for uploading custom plugins. Built with [discord.js](https://discord.js.org/), [Bun](https://bun.sh/), [Astro](https://astro.build/), and [Prisma](https://prisma.io/).

## Features

- **Server Control**: Start, stop, suspend, and resume the Minecraft server via Discord commands.
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
- Minecraft server (with REST API at `localhost:6001`)
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
        npx prisma migrate dev
        ```

        or

        ```sh
        npx prisma db push
        ```

4. **Build the web UI:**

    ```sh
    cd webUi
    bun run build
    ```

5. **Configure environment variables:**
   Create a `.env` file with the following (see `.gitignore` for sensitive files):

    ```env
    TOKEN=your_discord_bot_token
    CLIENT_ID=your_discord_client_id
    # this is fallback server if none is created
    SERVER_DIR=/path/to/minecraft/server
    MINECRAFT_VERSION=1.21.4 # or your server version
    LOADER_TYPE=paper        # or your server type
    MOD_TYPE=plugin          # or your mod type
    CF_KEY=your_cloudflare_api_key # Cloudflare API key, you may need to edit the code to fit your needs
    UPDATE_URL=https://api.cloudflare.com/client/v4/zones/ZONE_ID/dns_records/RECORD_ID # Cloudflare DNS record update URL
    DATABASE_URL=postgresql://username:password@localhost:5432/database_name
    UPLOAD_URL=https://your-domain.com # URL for the web UI upload server
    ```

6. **Register Discord commands:**

    ```sh
    bun tools/register.ts
    ```

7. **Start the bot:**

    ```sh
    bun index.ts
    ```

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
- Commands are auto-loaded from the `commands/` directory, following the structure of `CommandFile` in `lib/commandFile.ts`.
- Database schema managed with Prisma; run `npx prisma studio` to view data.
- Web UI built with Astro; source in `webUi/` directory.
- See `lib/` for core logic.

## License

Private project. Permitted for personal use only.
