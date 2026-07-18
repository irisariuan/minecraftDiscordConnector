# Migration: multi-game platform

This release generalises the Minecraft-only schema into a game-agnostic core.
The change is delivered as a single **data-preserving** Prisma migration,
`20260718000000_multigame_platform`, plus an optional idempotent backfill tool.

## What changes in the database

| Before | After |
| --- | --- |
| `Server.loaderType`, `modType`, `version`, `pluginPath`, `apiPort` (Minecraft columns) | Folded into `Server.config` (JSON) + `Server.runtimeVersion`; the columns are dropped |
| `Server.gameType` (default `"minecraft"`) | Replaced by `Server.pluginId` (default `"minecraft"`) |
| `Plugin` (Modrinth `projectId`/`versionId`) | Generic `ServerArtifact` (`provider`/`artifactId`/`versionId` + `metadata`) |
| `Player` (`uuid` PK, `playername`, `discordId`) | Generic `IdentityLink` (`pluginId`/`externalId`/`discordId` + `metadata`) |

Every existing row is **copied into the new shape before any column or table is
dropped**, in one transaction-safe SQL migration. No manual SQL edits are
required. All tickets, transactions, credits, permissions, settings, and
server-access rows are untouched.

The migration performs, in order:

1. Create `ServerArtifact` and `IdentityLink`.
2. `INSERT … SELECT` existing `Plugin` rows into `ServerArtifact`
   (`provider = 'modrinth'`, `artifactId = projectId`) and existing `Player`
   rows into `IdentityLink` (`pluginId = 'minecraft'`, `externalId = uuid`,
   `metadata = { playername }`).
3. Add `Server.config` / `pluginId` / `runtimeVersion`, backfill `config` from
   the Minecraft columns via `jsonb_build_object`, then drop those columns.
4. Drop `Plugin` and `Player`.

## Before you run it — back up

```sh
mkdir -p backups
pg_dump "$DATABASE_URL" > "backups/pre-multigame-$(date +%Y%m%d-%H%M%S).sql"
```

Verify the dump is non-empty before continuing.

## Apply the migration

```sh
bunx prisma migrate status   # should list 20260718000000_multigame_platform as pending
bunx prisma migrate deploy   # applies it
bunx prisma generate         # regenerate the client
```

## Verify

After applying, confirm the data moved:

```sql
-- Every server should have a pluginId and a populated config.
SELECT id, "pluginId", "runtimeVersion", config FROM "Server";

-- Modrinth records preserved as artifacts.
SELECT provider, count(*) FROM "ServerArtifact" GROUP BY provider;

-- Player links preserved as identities.
SELECT "pluginId", count(*) FROM "IdentityLink" GROUP BY "pluginId";
```

Row counts for `ServerArtifact` / `IdentityLink` should match the old
`Plugin` / `Player` counts from your backup.

## Optional backfill tool

If a Minecraft server row ends up with an incomplete `config` (for example one
created between deploys), run the idempotent safety tool. It fills any missing
Minecraft config keys from the environment and is safe to run repeatedly:

```sh
bun scripts/backfill-minecraft.ts --dry-run   # preview
bun scripts/backfill-minecraft.ts             # apply
```

## Rollback

The migration drops columns/tables, so rollback is **restore-from-backup**, not
a down-migration:

```sh
# Recreate an empty database (or drop+recreate), then:
psql "$DATABASE_URL" < backups/pre-multigame-YYYYMMDD-HHMMSS.sql
```

After restoring, check out the pre-migration code revision so the schema and
client match the restored data.

## Notes

- The core no longer reads Minecraft environment variables. `SERVER_DIR`,
  `MINECRAFT_VERSION`, `LOADER_TYPE`, `MOD_TYPE`, `SERVER_PORT`,
  `SERVER_API_PORT`, and `SERVER_TAG` are now consumed by the **Minecraft
  plugin's** bootstrap (only used to create a default server when the database
  is empty). See [PLUGINS.md](./PLUGINS.md).
- Existing servers whose `pluginId` has no matching loaded plugin will raise an
  actionable error rather than silently behaving like Minecraft. Keep the
  Minecraft plugin enabled to preserve current behaviour.
