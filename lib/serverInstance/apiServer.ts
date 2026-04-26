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
import { ticketEffectManager } from "../ticket/effect";
import { TicketEffectType } from "../ticket";

const verifySchema = z.object({
	serverPort: z.number(),
	uuid: z.uuid(),
	playerName: z.string(),
});
export const playSchema = verifySchema.extend({
	onlineTime: z.bigint().or(z.number()),
	disconnect: z.boolean().optional().default(false),
});
export const cancelShutdownSchema = verifySchema;

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
		if (parsed.data.disconnect) {
			return res.send(JSON.stringify({ kick: false }));
		}
		const effects = ticketEffectManager.getUserActiveEffects(
			player.discordId,
		);

		if (
			server.paymentManager.hasPaid(player.uuid) ||
			effects.some(
				({ ticket: { effect } }) =>
					effect.effect === TicketEffectType.FreePlay,
			)
		) {
			return res.send(JSON.stringify({ kick: false }));
		}
		if (
			!(await canSpendCredit(player.discordId, server.settings.playFee))
		) {
			return res.send(JSON.stringify({ kick: true }));
		}
		await changeCredit({
			change: -server.settings.playFee,
			reason: `Play on server ${server.config.tag ?? `Server #${server.id}`}`,
			userId: player.discordId,
			serverId: server.id,
		});
		server.paymentManager.markPaid(
			player.uuid,
			server.settings.paymentInterval,
		);
		const user = await client.users
			.fetch(player.discordId)
			.catch(() => null);
		if (user)
			await sendCreditNotification({
				user,
				creditChanged: -server.settings.playFee,
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
		if (player && player.playername !== parsed.data.playerName) {
			await updatePlayerName(parsed.data.uuid, parsed.data.playerName);
		}

		res.send(JSON.stringify({ verified: !!player }));
	});

	app.post("/cancelShutdown", jsonParser, async (req, res) => {
		const parsed = cancelShutdownSchema.safeParse(req.body);
		if (!req.body || !parsed.success) {
			console.log(
				"Invalid request body for /cancelShutdown endpoint:",
				req.body,
			);
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
			return res.status(400).send("Player not found");
		}
		if (player.playername !== parsed.data.playerName) {
			await updatePlayerName(parsed.data.uuid, parsed.data.playerName);
		}
		if (
			!(await canSpendCredit(
				player.discordId,
				server.settings.cancelShutdownFee,
			))
		) {
			return res.status(403).send("Not enough credit");
		}
		if (server.settings.cancelShutdownFee > 0) {
			await changeCredit({
				change: -server.settings.cancelShutdownFee,
				reason: `Cancel shutdown on server ${server.config.tag ?? `Server #${server.id}`}`,
				userId: player.discordId,
				serverId: server.id,
			});
			const user = await client.users
				.fetch(player.discordId)
				.catch(() => null);
			if (user)
				await sendCreditNotification({
					user,
					creditChanged: -server.settings.cancelShutdownFee,
					reason: `Cancel shutdown on server ${server.config.tag ?? `Server #${server.id}`}`,
					serverId: server.id,
					silent: true,
				});
		}
		res.send(JSON.stringify({ allowed: true }));
	});
}
