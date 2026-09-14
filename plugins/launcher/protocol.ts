/**
 * Shared constants between the launcher wrapper process and the in-bot plugin.
 *
 * This module must stay dependency-free: `launcher.ts` imports it *outside* the
 * bot (before any env/db is available), so it cannot pull in `plugins/api.ts`.
 */

/**
 * Exit code the bot uses to ask the launcher for a restart. Anything else makes
 * the launcher exit with the same code (so crashes and deliberate shutdowns are
 * passed through unchanged).
 */
export const RESTART_EXIT_CODE = 75;

/** Set to "1" in the bot's environment when it runs under the launcher. */
export const LAUNCHER_ENV_KEY = "BOT_LAUNCHER";

/** The launcher's pid, exposed to the bot for diagnostics. */
export const LAUNCHER_PID_ENV_KEY = "BOT_LAUNCHER_PID";
