import bodyParser from "body-parser";
import { type Express } from "express";
import type { ServerManager } from "../server";
import z from "zod";
import { getPlayerByUuid, updatePlayerName } from "../db";
import type { Client } from "discord.js";
import {
	canSpendCredit,
	changeCredit,
	sendCreditNotification,
} from "../credit";

const verifySchema = z.object({
	serverPort: z.number(),
	uuid: z.uuid(),
	playerName: z.string(),
});
export const playSchema = verifySchema.extend({
	onlineTime: z.bigint().or(z.number()),
	disconnect: z.boolean().optional().default(false),
});

export function initApiServer(
	app: Express,
	serverManager: ServerManager,
	client: Client,
) {
	const jsonParser = bodyParser.json();

	app.post("/play", jsonParser, async (req, res) => {
		const parsed = playSchema.safeParse(req.body);
		if (!req.body || !parsed.success) {
			console.log("Invalid request body for /play endpoint:", req.body);
			return res.status(400).send("Invalid request body");
		}
		const server = await serverManager.getActiveServerFromPort(
			parsed.data.serverPort,
		);
		if (!server) {
			return res.status(400).send("Invalid server port");
		}
		const player = await getPlayerByUuid(parsed.data.uuid);
		if (!player) {
			return res.send(JSON.stringify({ kick: true }));
		}
		if (player.playername !== parsed.data.playerName) {
			await updatePlayerName(parsed.data.uuid, parsed.data.playerName);
		}
		if (
			!(await canSpendCredit(
				player.discordId,
				server.creditSettings.playFee,
			)) &&
			!parsed.data.disconnect
		) {
			return res.send(JSON.stringify({ kick: true }));
		}
		await changeCredit({
			change: -server.creditSettings.playFee,
			reason: `Play on server ${server.config.tag ?? `Server #${server.id}`}`,
			userId: player.discordId,
			serverId: server.id,
		});
		const user = await client.users
			.fetch(player.discordId)
			.catch(() => null);
		if (user)
			await sendCreditNotification({
				user,
				creditChanged: -server.creditSettings.playFee,
				reason: `Play on server ${server.config.tag ?? `Server #${server.id}`}`,
				serverId: server.id,
				silent: true,
			});
		res.send(JSON.stringify({ kick: false }));
	});
	app.post("/verify", jsonParser, async (req, res) => {
		const parsed = verifySchema.safeParse(req.body);
		if (!req.body || !parsed.success) {
			console.log("Invalid request body for /verify endpoint:", req.body);
			return res.status(400).send("Invalid request body");
		}
		const server = await serverManager.getActiveServerFromPort(
			parsed.data.serverPort,
		);
		if (!server) {
			return res.status(400).send("Invalid server port");
		}
		const player = await getPlayerByUuid(parsed.data.uuid);
		if (player?.playername !== parsed.data.playerName) {
			await updatePlayerName(parsed.data.uuid, parsed.data.playerName);
		}

		res.send(JSON.stringify({ verified: !!player }));
	});
}
