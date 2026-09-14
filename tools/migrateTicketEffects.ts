/**
 * Migration tool: converts Ticket.value (Float?) → Ticket.effectData (Json)
 *
 * Run this BEFORE applying the Prisma migration that drops the `value` column.
 *
 * Workflow:
 *   1. bun run tools/migrateTicketEffects.ts   ← this file
 *   2. npx prisma migrate dev --name ticket_effect_data
 *      (or npx prisma db push)
 *
 * The tool is idempotent – rows that already have effectData populated are
 * skipped unless --force is passed.
 *
 * Usage:
 *   bun run tools/migrateTicketEffects.ts [--dry-run] [--force] [--verify-only]
 */

import { prisma } from "../lib/prisma";
import {
	TicketEffectType,
	buildEffectFromValue,
	serializeEffectData,
	formatEffectData,
	deserializeEffectData,
} from "../lib/ticket";
import { confirm } from "@inquirer/prompts";

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------
const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");
const verifyOnly = process.argv.includes("--verify-only");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Shape returned by the raw SELECT against the old schema. */
interface RawTicketRow {
	id: string;
	effect: string;
	/** Comes back as a JS number or null from PostgreSQL Float */
	value: number | null;
	/** Comes back as an object/null if effectData already exists */
	effectData: unknown;
}

/**
 * Returns true when a column exists in the `Ticket` table.
 * Uses pg_attribute for a reliable, schema-safe check.
 */
async function columnExists(columnName: string): Promise<boolean> {
	const rows = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(`
        SELECT EXISTS (
            SELECT 1
            FROM   information_schema.columns
            WHERE  table_name  = 'Ticket'
              AND  column_name = '${columnName}'
        ) AS exists
    `);
	return rows[0]?.exists ?? false;
}

/**
 * Maps a raw DB row (effect type + old Float value) to the new effectData
 * JSON object, using the named fields defined by the discriminated union.
 */
function buildEffectData(
	effectType: string,
	value: number | null,
): Record<string, number> {
	const type = effectType as TicketEffectType;

	// Default fallbacks so we never write null into a required JSON field.
	const defaults: Record<TicketEffectType, number> = {
		[TicketEffectType.Multiplier]: 1,
		[TicketEffectType.FixedCredit]: 0,
		[TicketEffectType.FreeUnderCost]: 0,
		[TicketEffectType.FreePlay]: 1,
		[TicketEffectType.CustomApprovalCount]: 1,
		[TicketEffectType.RepeatApprove]: 1,
	};

	const safeValue = value ?? defaults[type] ?? 0;
	const effect = buildEffectFromValue(type, safeValue);
	return serializeEffectData(effect);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log("=".repeat(60));
console.log("  Ticket effectData migration tool");
console.log("=".repeat(60));

if (dryRun) console.log("  ⚠  DRY-RUN mode – no changes will be written\n");
if (force) console.log("  ⚠  FORCE mode – all rows will be re-migrated\n");

// Step 0 – Check which columns currently exist
const hasValue = await columnExists("value");
const hasEffectData = await columnExists("effectData");

console.log(`\nColumn audit on "Ticket":`);
console.log(`  value      (Float?):  ${hasValue ? "✅ present" : "❌ absent"}`);
console.log(
	`  effectData (Json):   ${hasEffectData ? "✅ present" : "❌ absent"}`,
);

if (!hasValue && !hasEffectData) {
	console.error(
		'\nNeither column found. Is the "Ticket" table correct? Aborting.',
	);
	process.exit(1);
}

if (!hasValue && hasEffectData) {
	console.log(
		"\nThe `value` column is already gone – migration was previously completed.",
	);
	if (!verifyOnly) {
		console.log('Re-running in --verify-only mode.');
	}
}

// ------------------------------------------------------------------
// Step 1 – Add effectData column if it doesn't yet exist
// ------------------------------------------------------------------
if (!hasEffectData) {
	if (dryRun) {
		console.log(
			'\n[dry-run] Would run: ALTER TABLE "Ticket" ADD COLUMN "effectData" JSONB',
		);
	} else {
		console.log('\nAdding "effectData" JSONB column…');
		await prisma.$executeRawUnsafe(
			`ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "effectData" JSONB`,
		);
		console.log("  ✅ Column added.");
	}
}

// ------------------------------------------------------------------
// Step 2 – Read all Ticket rows
// ------------------------------------------------------------------

// Build a SELECT that handles the case where one of the columns may be absent.
let selectSql: string;
if (hasValue && hasEffectData) {
	selectSql = `SELECT id, effect, value, "effectData" FROM "Ticket"`;
} else if (hasValue) {
	selectSql = `SELECT id, effect, value, NULL AS "effectData" FROM "Ticket"`;
} else {
	selectSql = `SELECT id, effect, NULL AS value, "effectData" FROM "Ticket"`;
}

const rows = await prisma.$queryRawUnsafe<RawTicketRow[]>(selectSql);

console.log(`\nFound ${rows.length} ticket type(s) to inspect.`);
if (rows.length === 0) {
	console.log("Nothing to do – exiting.");
	await prisma.$disconnect();
	process.exit(0);
}

// ------------------------------------------------------------------
// Step 3 – Determine which rows need to be migrated
// ------------------------------------------------------------------
type RowWork = {
	id: string;
	effect: string;
	value: number | null;
	newData: Record<string, number>;
};

const toMigrate: RowWork[] = [];
const skipped: string[] = [];
const invalid: string[] = [];

for (const row of rows) {
	// Validate effect type
	if (!Object.values(TicketEffectType).includes(row.effect as TicketEffectType)) {
		invalid.push(`  ❌ id=${row.id}  unknown effect="${row.effect}"`);
		continue;
	}

	const alreadyMigrated =
		row.effectData !== null &&
		typeof row.effectData === "object";

	if (alreadyMigrated && !force) {
		skipped.push(row.id);
		continue;
	}

	toMigrate.push({
		id: row.id,
		effect: row.effect,
		value: row.value,
		newData: buildEffectData(row.effect, row.value),
	});
}

if (invalid.length > 0) {
	console.error("\nRows with unrecognised effect types (will be skipped):");
	invalid.forEach((msg) => console.error(msg));
}

console.log(`\nMigration plan:`);
console.log(`  To migrate : ${toMigrate.length}`);
console.log(`  Skipped    : ${skipped.length} (already have effectData)`);
console.log(`  Invalid    : ${invalid.length} (unknown effect type)`);

if (toMigrate.length > 0) {
	console.log("\nPreview of changes:");
	for (const row of toMigrate) {
		const parsedEffect = deserializeEffectData(row.effect, row.newData);
		console.log(
			`  [${row.id}]  ${row.effect}  value=${row.value ?? "null"}  →  effectData=${JSON.stringify(row.newData)}  (${formatEffectData(parsedEffect)})`,
		);
	}
}

// ------------------------------------------------------------------
// Step 4 – Verify-only mode exits here
// ------------------------------------------------------------------
if (verifyOnly) {
	const unmigratedCount = toMigrate.length;
	if (unmigratedCount === 0) {
		console.log("\n✅ Verification passed – all rows have effectData.");
	} else {
		console.warn(
			`\n⚠  Verification found ${unmigratedCount} unmigrated row(s). Run without --verify-only to fix.`,
		);
		process.exit(2);
	}
	await prisma.$disconnect();
	process.exit(0);
}

// ------------------------------------------------------------------
// Step 5 – Confirm before writing
// ------------------------------------------------------------------
if (toMigrate.length === 0) {
	console.log(
		"\nAll rows are already migrated. Nothing to write. ✅",
	);
} else if (!dryRun) {
	const proceed = await confirm({
		message: `\nWrite effectData for ${toMigrate.length} row(s)?`,
		default: true,
	});

	if (!proceed) {
		console.log("Aborted.");
		await prisma.$disconnect();
		process.exit(0);
	}

	// ------------------------------------------------------------------
	// Step 6 – Write effectData for each row
	// ------------------------------------------------------------------
	console.log("\nMigrating rows…");
	let migrated = 0;
	let failed = 0;

	for (const row of toMigrate) {
		try {
			await prisma.$executeRawUnsafe(
				`UPDATE "Ticket" SET "effectData" = $1::jsonb WHERE id = $2`,
				JSON.stringify(row.newData),
				row.id,
			);
			console.log(
				`  ✅ [${row.id}]  ${row.effect}  →  ${JSON.stringify(row.newData)}`,
			);
			migrated++;
		} catch (err) {
			console.error(
				`  ❌ [${row.id}]  Failed to migrate: ${err}`,
			);
			failed++;
		}
	}

	console.log(`\nDone. Migrated: ${migrated}, Failed: ${failed}`);

	if (failed > 0) {
		console.error(
			"\nSome rows failed to migrate. Fix the errors above before proceeding.",
		);
		await prisma.$disconnect();
		process.exit(1);
	}
} else {
	console.log("\n[dry-run] Skipping writes.");
}

// ------------------------------------------------------------------
// Step 7 – Post-migration instructions
// ------------------------------------------------------------------
if (!dryRun) {
	console.log("\n" + "=".repeat(60));
	console.log("  Next steps");
	console.log("=".repeat(60));

	if (hasValue) {
		console.log(`
The Prisma schema already has the final state (effectData Json, no value).
Now run the database migration to drop the old column:

  npx prisma migrate dev --name ticket_effect_data
    — or —
  npx prisma db push

If you prefer to apply raw SQL first and push schema later:

  ALTER TABLE "Ticket" ALTER COLUMN "effectData" SET NOT NULL;
  ALTER TABLE "Ticket" DROP COLUMN IF EXISTS "value";

Then regenerate the Prisma client:

  npx prisma generate
`);
	} else {
		console.log(`
The "value" column is already gone. If you haven't yet run prisma generate,
do so now so the TypeScript client reflects the current schema:

  npx prisma generate
`);
	}
}

await prisma.$disconnect();
