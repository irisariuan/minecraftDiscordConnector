/**
 * Handlers for requests the connector plugin makes into the bot: pay-per-play
 * enforcement, player verification, and shutdown-cancel fees.
 *
 * These used to be Express routes on an inbound HTTP port; they now run over
 * the server's IPC connection, so the calling server is identified by the
 * connection itself instead of a self-reported port. All core access still goes
 * through the restricted plugin data channels.
 */
import { z } from "zod";
import { data } from "../../api";
import type { ConnectorConnection, HostHandlers } from "./ipc";
import { paymentManagerFor } from "./paymentManager";

/** Minecraft's `free_play` ticket effect type string (see core ticket system). */
const FREE_PLAY_EFFECT = "free_play";

const playerSchema = z.object({
	uuid: z.string(),
	playerName: z.string(),
});
const playSchema = playerSchema.extend({
	onlineTime: z.bigint().or(z.number()),
	disconnect: z.boolean().optional().default(false),
});

function playernameOf(metadata: unknown): string | null {
	if (metadata && typeof metadata === "object" && "playername" in metadata) {
		const value = (metadata as Record<string, unknown>).playername;
		return typeof value === "string" ? value : null;
	}
	return null;
}

/** Parse a payload, turning a bad frame into a rejected request. */
function parse<T>(schema: z.ZodType<T>, params: unknown): T {
	const parsed = schema.safeParse(params);
	if (!parsed.success) throw new Error("Invalid request body");
	return parsed.data;
}

/** The live server behind a connection; throws when it is no longer running. */
async function activeServer(connection: ConnectorConnection) {
	const server = await data.request("server:getActiveById", {
		id: connection.serverId,
	});
	if (!server) throw new Error(`Server #${connection.serverId} is not running`);
	return server;
}

/** Look up the identity link for a player, refreshing a stale player name. */
async function linkFor(uuid: string, playerName: string) {
	const link = await data.request("identity:getByExternal", {
		pluginId: "minecraft",
		externalId: uuid,
	});
	if (link && playernameOf(link.metadata) !== playerName) {
		await data.request("identity:updateMetadata", {
			pluginId: "minecraft",
			externalId: uuid,
			metadata: { playername: playerName },
		});
	}
	return link;
}

export const hostHandlers: HostHandlers = {
	async "player.verify"(params) {
		const { uuid, playerName } = parse(playerSchema, params);
		return { verified: !!(await linkFor(uuid, playerName)) };
	},

	async "player.play"(params, connection) {
		const { uuid, playerName, disconnect } = parse(playSchema, params);
		const server = await activeServer(connection);

		const link = await linkFor(uuid, playerName);
		if (!link) return { kick: true };
		if (disconnect) return { kick: false };

		const payment = paymentManagerFor(server.id);
		const effects = await data.request("ticket:getActiveEffectTypes", {
			userId: link.discordId,
		});
		if (payment.hasPaid(uuid) || effects.includes(FREE_PLAY_EFFECT)) {
			return { kick: false };
		}

		const playFee = server.settings.playFee;
		if (
			!(await data.request("credit:canSpend", {
				userId: link.discordId,
				cost: playFee,
			}))
		) {
			return { kick: true };
		}

		const label = server.tag ?? `Server #${server.id}`;
		await data.request("credit:charge", {
			discordId: link.discordId,
			change: -playFee,
			reason: `Play on server ${label}`,
			serverId: server.id,
			silent: true,
		});
		payment.markPaid(uuid, server.settings.paymentInterval);
		return { kick: false };
	},

	async "shutdown.requestCancel"(params, connection) {
		const { uuid, playerName } = parse(playerSchema, params);
		const server = await activeServer(connection);

		const link = await linkFor(uuid, playerName);
		if (!link) return { allowed: false, reason: "Player is not linked" };

		const fee = server.settings.cancelShutdownFee;
		if (fee <= 0) return { allowed: true };
		if (
			!(await data.request("credit:canSpend", {
				userId: link.discordId,
				cost: fee,
			}))
		) {
			return { allowed: false, reason: "Not enough credit" };
		}

		const label = server.tag ?? `Server #${server.id}`;
		await data.request("credit:charge", {
			discordId: link.discordId,
			change: -fee,
			reason: `Cancel shutdown on server ${label}`,
			serverId: server.id,
			silent: true,
		});
		return { allowed: true };
	},
};
