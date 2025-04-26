# Discord Minecraft Linkage

A Discord bot for managing a Minecraft server, including plugin management, server control, DNS updates, and permission-based access. Built with [discord.js](https://discord.js.org/) and [Bun](https://bun.sh/).

## Features

- **Server Control**: Start, stop, suspend, and resume the Minecraft server via Discord commands.
- **Plugin Management**: Search, append, and delete plugins using Modrinth API.
- **Approval System**: Sensitive actions (like server start/stop) can require multi-user approval.
- **Permission System**: Fine-grained user and role permissions for all commands.
- **DNS Management**: Update Cloudflare DNS records to match the server's public IP.
- **Player Info**: List online players and view server logs.
- **Credit System**: Users spend and transfer credits for privileged actions.
- **Pagination**: Paginated responses for long lists (logs, plugins, players).

## Requirements

- [Bun](https://bun.sh/) runtime
- Node.js v18+ (for some dependencies)
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
   ```

3. **Configure environment variables:**
   Create a `.env` file with the following (see `.gitignore` for sensitive files):

   ```env
   TOKEN=your_discord_bot_token
   CLIENT_ID=your_discord_client_id
   SERVER_DIR=/path/to/minecraft/server
   MINECRAFT_VERSION=1.21.4 # or your server version
   LOADER_TYPE=paper        # or your server type
   MOD_TYPE=plugin          # or your mod type
   CF_KEY=your_cloudflare_api_key # Cloudflare API key, you may need to edit the code to fit your needs
   UPDATE_URL=https://api.cloudflare.com/client/v4/zones/ZONE_ID/dns_records/RECORD_ID # Cloudflare DNS record update URL
   ```

4. **Register Discord commands:**

   ```sh
   bun tools/register.ts
   ```

5. **Start the bot:**

   ```sh
   bun index.ts
   ```

6. **Optional: Give permission to admin account in Discord**
	
   You may want to give your admin account permission to use the bot (such that you could later edit permission through Discord). You can do this by running the following command:
	
   ```sh
   bun tools/editPerm.ts
   ```

## Usage

All commands are available as Discord slash commands. Some require specific permissions or multi-user approval. Some actions (like running commands or viewing others' info) may cost credits.

### Example Commands

- `/startserver [force]` — Start the server (may require approval or credit)
- `/stopserver [seconds] [force]` — Stop the server (may require approval or credit)
- `/cancelstopserver` — Cancel a scheduled server shutdown (may require approval)
- `/suspend` and `/unsuspend` — Suspend/resume the server (require permission)
- `/searchplugin [plugin]` — Search for plugins
- `/appendplugin [plugin]` — Download and add a plugin
- `/deleteplugin [plugin]` — Delete a plugin from the server
- `/getactiveplugins [api]` — List active plugins (API or local)
- `/log [filter]` — View server logs (paginated)
- `/onlineplayers` — List online players (paginated)
- `/refresh` — Update DNS record
- `/getperm [user]` — View user permissions (costs credit for others)
- `/editperm` — Edit user or role permissions (require permission)
- `/credit [user]` — View your or another user's credit (costs credit for others)
- `/changecredit set|change` — Set or change a user's credit (require permission)
- `/transfercredit user amount` — Transfer credit to another user

## Permissions

Permissions are managed via `/editperm` and stored in `data/permissions.json`. See `lib/permission.ts` for all available permission flags.

- **Grant or remove permissions** to users or roles using `/editperm`.
- **Credit system**: Some actions (like running commands, viewing others' info) cost credits. Admins can set or change credits with `/changecredit`.

## Development

- TypeScript project, configured for Bun and ESNext.
- Commands are auto-loaded from the `commands/` directory, following the structure of `CommandFile` in `lib/commandFile.ts`.
- See `lib/` for core logic.

## License

Private project. Permitted for personal use only.