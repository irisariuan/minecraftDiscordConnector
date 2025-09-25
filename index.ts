import { input } from "@inquirer/prompts";
import { Client, GatewayIntentBits, MessageFlags } from "discord.js";
import "dotenv/config";
import { approvalList, updateApprovalMessage } from "./lib/approval";
import { loadCommands } from "./lib/commandFile";
import { changeCredit, getCredit, sendCreditNotification } from "./lib/credit";
import { updateDnsRecord } from "./lib/dnsRecord";
import {
	compareAllPermissions,
	comparePermission,
	getUsersMatchedPermission,
	PermissionFlags,
	readPermission,
} from "./lib/permission";
import { serverManager } from "./lib/server";
import {
	changeCreditSettings,
	loadSettings,
	settings,
} from "./lib/settings";
import { isSuspending, suspendingEvent } from "./lib/suspend";
import { getNextTimestamp } from "./lib/time";
import { setActivity } from "./lib/utils";

const commands = await loadCommands();

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMembers,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.GuildPresences,
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.GuildMessageReactions,
		GatewayIntentBits.DirectMessages,
		GatewayIntentBits.DirectMessageTyping,
		GatewayIntentBits.DirectMessagePolls,
		GatewayIntentBits.DirectMessageReactions,
	],
});

const giveCredits = Number.parseInt(
	await input({
		message: "Give credits to users?",
		required: true,
		default: "0",
		validate: (value) => {
			const num = Number.parseInt(value);
			if (isNaN(num) || num < 0)
				return "Please enter a valid number bigger or equals to 0";
			return true;
		},
	}),
);

const currentSettings = await loadSettings();
console.log("Loaded custom settings");

changeCreditSettings({
	dailyGift: Number.parseInt(
		await input({
			message: "Daily gift amount?",
			required: true,
			default: (currentSettings.dailyGift ?? 5).toString(),
			validate: (value) => {
				const num = Number.parseInt(value);
				if (isNaN(num) || num < 0)
					return "Please enter a valid number bigger or equals to 0";
				return true;
			},
		}),
	),
	giftMax: Number.parseInt(
		await input({
			message: "Gift users below this amount? (negative to disable)",
			required: true,
			default: (currentSettings.giftMax ?? 100).toString(),
			validate: (value) => {
				const num = Number.parseInt(value);
				if (isNaN(num)) return "Please enter a valid number";
				return true;
			},
		}),
	),
});

client.once("ready", async () => {
	console.log(`Logged in as ${client.user?.tag}`);
	setActivity(
		client,
		(await serverManager.isOnline.getData()) || false,
		isSuspending(),
	);
	if (giveCredits > 0) {
		const users = await getUsersMatchedPermission(PermissionFlags.use);
		for (const userId of users) {
			await changeCredit(userId, giveCredits, "System Gift");
			const user = client.users.cache.get(userId);
			if (user) {
				await sendCreditNotification(
					{ user, creditChanged: giveCredits, reason: "System Gift", silent: true },
				);
			}
		}
		console.log(`Gave ${giveCredits} credits to ${users.join(", ")}`);
	}
});

client.on("interactionCreate", async (interaction) => {
	if (interaction.isChatInputCommand()) {
		if (
			!compareAllPermissions(await readPermission(interaction.user.id), [
				PermissionFlags.use,
			])
		) {
			return interaction.reply({
				content: "You do not have permission to use this command",
				flags: [MessageFlags.Ephemeral],
			});
		}
		const { commandName } = interaction;
		const command = commands.find(
			(cmd) => cmd.command.name === commandName,
		);
		if (!command)
			return interaction.reply({
				content: "Command not found",
				flags: [MessageFlags.Ephemeral],
			});
		if (
			command.permissions &&
			!compareAllPermissions(
				await readPermission(interaction.user.id),
				command.permissions,
			)
		) {
			return interaction.reply({
				content: "You do not have permission to use this command",
				flags: [MessageFlags.Ephemeral],
			});
		}
		if (
			isSuspending() &&
			!comparePermission(
				await readPermission(interaction.user.id),
				PermissionFlags.suspend,
			)
		) {
			return interaction.reply({
				content:
					"Server is suspending, you do not have permission to use this command",
				flags: [MessageFlags.Ephemeral],
			});
		}
		await Promise.try(() => command.execute(interaction, client)).catch(
			(err) => {
				console.error(err);
				interaction
					.reply({
						content:
							"An error occurred while executing the command",
						flags: [MessageFlags.Ephemeral],
					})
					.catch((err) => {
						console.error(err);
						interaction
							.editReply({
								content:
									"An error occurred while executing the command",
							})
							.catch((err) => {
								console.error(err);
								interaction.followUp({
									content:
										"An error occurred while executing the command",
									flags: [MessageFlags.Ephemeral],
								});
							});
					});
			},
		);
	}
});

client.on("messageReactionAdd", async (reaction, user) => {
	if (user.bot) return;
	updateApprovalMessage(reaction, user);
});

serverManager.isOnline.cacheEvent.on("setData", (data) => {
	setActivity(client, data || false, isSuspending());
});

suspendingEvent.on("update", async (data) => {
	setActivity(
		client,
		(await serverManager.isOnline.getData()) || false,
		data,
	);
});

setInterval(updateDnsRecord, 24 * 60 * 60 * 1000);
updateDnsRecord();

const timeBeforeFirstRun =
	getNextTimestamp({ hour: 14, minute: 0 }).getTime() - Date.now();

setTimeout(async () => {
	const func = async () => {
		const giftAmount = settings.dailyGift;
		if (giftAmount <= 0) return;
		const users = await getUsersMatchedPermission(PermissionFlags.gift);
		for (const userId of users) {
			if (settings.giftMax > 0) {
				const credit = await getCredit(userId);
				if (credit.currentCredit > settings.giftMax) continue;
			}

			console.log(`Gifted ${userId} ${giftAmount} credits`);
			await changeCredit(userId, giftAmount, "Daily Gift");
			const user = client.users.cache.get(userId);
			if (user) {
				await sendCreditNotification(
					{ user, creditChanged: giftAmount, reason: "Daily Gift", silent: true },
				);
			}
		}
	};
	setInterval(func, 24 * 60 * 60 * 1000);
	await func();
}, timeBeforeFirstRun);

console.log(`Time before first run: ${Math.round(timeBeforeFirstRun / 1000)}s`);

async function exitHandler() {
	const { success, promise } = await serverManager.stop(0);
	if (success) {
		console.log("Server process shutting down");
		await promise;
		console.log("Server process stopped");
	}
	for (const [id, approval] of approvalList.entries()) {
		console.log(`Found approval ${id}, trying to clean up...`);
		if (approval.options.startPollFee) {
			console.log(
				`Refund ${approval.options.startPollFee} to caller ${approval.options.callerId}`,
			);
			await changeCredit(
				approval.options.callerId,
				approval.options.startPollFee,
				"New Approval Poll Refund",
			);
			const user = client.users.cache.get(approval.options.callerId);
			if (user) {
				await sendCreditNotification(
					{ user, creditChanged: approval.options.startPollFee, reason: "New Approval Poll Refund", silent: true },
				);
			}
		}
		if (approval.options.credit) {
			for (const id of approval.approvalIds.concat(
				approval.disapprovalIds,
			)) {
				await changeCredit(
					id,
					approval.options.credit,
					"Approval Reaction Refund",
				);
				const user = client.users.cache.get(id);
				if (user) {
					await sendCreditNotification(
						{ user, creditChanged: approval.options.credit, reason: "Approval Reaction Refund", silent: true },
					);
				}
			}
		}
		if (approval.message.editable) {
			await approval.message.reactions.removeAll();
			await approval.message.edit({
				content: "Approval Canceled",
				embeds: [],
			});
			continue;
		}
		if (approval.message.deletable) {
			await approval.message.delete();
		}
	}
}

process.on("unhandledRejection", (reason) => {
	console.error("Unhandled Rejection:", reason);
});
process.on("uncaughtException", (error) => {
	console.error("Uncaught Exception:", error);
});

process.on("SIGINT", async () => {
	await exitHandler().catch((err) =>
		console.error("Error occurred during SIGINT:", err),
	);
	process.exit(64);
});

process.on("beforeExit", async (code) => {
	if (code === 64) return;
	await exitHandler().catch((err) =>
		console.error("Error occurred before exit:", err),
	);
	process.exit(code);
});

process.on("exit", async (code) => {
	console.log(`Process exited with code ${code}`);
	process.exit(code);
});

client.login(process.env.TOKEN);
