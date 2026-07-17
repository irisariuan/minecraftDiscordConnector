import bodyParser from "body-parser";
import express, { type Express } from "express";
import { z } from "zod";
import { data } from "../../api";
import { paymentManagerFor } from "./paymentManager";

/** Minecraft's `free_play` ticket effect type string (see core ticket system). */
const FREE_PLAY_EFFECT = "free_play";

const verifySchema = z.object({
	serverPort: z.number(),
	uuid: z.string(),
	playerName: z.string(),
});
const playSchema = verifySchema.extend({
	onlineTime: z.bigint().or(z.number()),
	disconnect: z.boolean().optional().default(false),
});
const cancelShutdownSchema = verifySchema;

function playernameOf(metadata: unknown): string | null {
	if (metadata && typeof metadata === "object" && "playername" in metadata) {
		const value = (metadata as Record<string, unknown>).playername;
		return typeof value === "string" ? value : null;
	}
	return null;
}

/**
 * Build the inbound callback Express app that the Minecraft connector calls back
 * into: pay-per-play enforcement, player verification, and shutdown-cancel fees.
 * All core access goes through the restricted plugin data channels.
 */
export function createCallbackApp(): Express {
	const app = express();
	const jsonParser = bodyParser.json();

	app.post("/play", jsonParser, async (req, res) => {
		const parsed = playSchema.safeParse(req.body);
		if (!parsed.success) return res.status(400).send("Invalid request body");
		const server = await data.request("server:getActiveByPort", {
			port: parsed.data.serverPort,
		});
		if (!server) return res.status(400).send("Invalid server port");

		const link = await data.request("identity:getByExternal", {
			pluginId: "minecraft",
			externalId: parsed.data.uuid,
		});
		if (!link) return res.send(JSON.stringify({ kick: true }));

		if (playernameOf(link.metadata) !== parsed.data.playerName) {
			await data.request("identity:updateMetadata", {
				pluginId: "minecraft",
				externalId: parsed.data.uuid,
				metadata: { playername: parsed.data.playerName },
			});
		}
		if (parsed.data.disconnect) {
			return res.send(JSON.stringify({ kick: false }));
		}

		const payment = paymentManagerFor(server.id);
		const effects = await data.request("ticket:getActiveEffectTypes", {
			userId: link.discordId,
		});
		if (
			payment.hasPaid(parsed.data.uuid) ||
			effects.includes(FREE_PLAY_EFFECT)
		) {
			return res.send(JSON.stringify({ kick: false }));
		}

		const playFee = server.settings.playFee;
		if (
			!(await data.request("credit:canSpend", {
				userId: link.discordId,
				cost: playFee,
			}))
		) {
			return res.send(JSON.stringify({ kick: true }));
		}

		const label = server.tag ?? `Server #${server.id}`;
		await data.request("credit:charge", {
			discordId: link.discordId,
			change: -playFee,
			reason: `Play on server ${label}`,
			serverId: server.id,
			silent: true,
		});
		payment.markPaid(parsed.data.uuid, server.settings.paymentInterval);
		res.send(JSON.stringify({ kick: false }));
	});

	app.post("/verify", jsonParser, async (req, res) => {
		const parsed = verifySchema.safeParse(req.body);
		if (!parsed.success) return res.status(400).send("Invalid request body");
		const link = await data.request("identity:getByExternal", {
			pluginId: "minecraft",
			externalId: parsed.data.uuid,
		});
		if (link && playernameOf(link.metadata) !== parsed.data.playerName) {
			await data.request("identity:updateMetadata", {
				pluginId: "minecraft",
				externalId: parsed.data.uuid,
				metadata: { playername: parsed.data.playerName },
			});
		}
		res.send(JSON.stringify({ verified: !!link }));
	});

	app.post("/cancelShutdown", jsonParser, async (req, res) => {
		const parsed = cancelShutdownSchema.safeParse(req.body);
		if (!parsed.success) return res.status(400).send("Invalid request body");
		const server = await data.request("server:getActiveByPort", {
			port: parsed.data.serverPort,
		});
		if (!server) return res.status(400).send("Invalid server port");
		const link = await data.request("identity:getByExternal", {
			pluginId: "minecraft",
			externalId: parsed.data.uuid,
		});
		if (!link) return res.status(400).send("Player not found");

		const fee = server.settings.cancelShutdownFee;
		if (
			fee > 0 &&
			!(await data.request("credit:canSpend", {
				userId: link.discordId,
				cost: fee,
			}))
		) {
			return res.status(403).send("Not enough credit");
		}
		if (fee > 0) {
			const label = server.tag ?? `Server #${server.id}`;
			await data.request("credit:charge", {
				discordId: link.discordId,
				change: -fee,
				reason: `Cancel shutdown on server ${label}`,
				serverId: server.id,
				silent: true,
			});
		}
		res.send(JSON.stringify({ allowed: true }));
	});

	return app;
}
