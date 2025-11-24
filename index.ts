import { input } from "@inquirer/prompts";
import {
	Client,
	ComponentType,
	GatewayIntentBits,
	MessageFlags,
} from "discord.js";
import "dotenv/config";
import { updateApprovalMessage } from "./lib/approval";
import { doNotRequireServer, loadCommands } from "./lib/commandFile";
import { changeCredit, getCredit, sendCreditNotification } from "./lib/credit";
import { updateDnsRecord } from "./lib/dnsRecord";
import {
	compareAllPermissions,
	comparePermission,
	getUsersWithMatchedPermission,
	PermissionFlags,
	readPermission,
} from "./lib/permission";
import {
	changeCreditSettings,
	loadCreditSettings,
	settings,
} from "./lib/settings";
import { getNextTimestamp } from "./lib/time";
import { setActivity } from "./lib/utils";
import { isApprovalMessageComponentId } from "./lib/approval/component";
import { createServerManager, Server } from "./lib/server";
import { createServer, hasAnyServer } from "./lib/db";
import { serverConfig } from "./lib/plugin";
import { createServerSelectionMenu } from "./lib/embed/server";

const commands = await loadCommands();
if (!(await hasAnyServer())) {
	console.log(
		"No server found in database, creating a new server with default configuration...",
	);
	await createServer({
		loaderType: serverConfig.loaderType,
		version: serverConfig.minecraftVersion,
		path: serverConfig.serverDir,
		pluginPath: serverConfig.pluginDir,
		modType: serverConfig.modType,
	});
	console.log("Default server created.");
}

const serverManager = await createServerManager();
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

const giveCredits = process.argv.includes("-C")
	? Number.parseInt(
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
		)
	: 0;

const currentSettings = await loadCreditSettings();
console.log("Loaded custom settings");
if (process.argv.includes("-C")) {
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
}

client.once("ready", async () => {
	console.log(`Logged in as ${client.user?.tag}`);
	if (giveCredits > 0) {
		const users = await getUsersWithMatchedPermission(PermissionFlags.use);
		for (const userId of users) {
			await changeCredit({
				userId,
				change: giveCredits,
				reason: "System Gift",
			});
			const user = await client.users.fetch(userId).catch(() => null);
			if (user) {
				await sendCreditNotification({
					user,
					creditChanged: giveCredits,
					reason: "System Gift",
					silent: true,
				});
			}
		}
		console.log(`Gave ${giveCredits} credits to ${users.join(", ")}`);
	}
});

client.on("interactionCreate", async (interaction) => {
	if (interaction.isChatInputCommand()) {
		if (
			!compareAllPermissions(await readPermission(interaction.user), [
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
			!comparePermission(
				await readPermission(interaction.user),
				command.permissions,
			)
		) {
			return interaction.reply({
				content: "You do not have permission to use this command",
				flags: [MessageFlags.Ephemeral],
			});
		}

		if (!interaction.channel?.isSendable()) {
			return interaction.reply({
				content: "Cannot send messages in this channel",
				flags: [MessageFlags.Ephemeral],
			});
		}
		const errorHandler = (err: Error) => {
			console.error(err);
			interaction
				.reply({
					content: "An error occurred while executing the command",
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
		};

		if (doNotRequireServer(command)) {
			return await Promise.try(() =>
				command.execute({ interaction, client }),
			).catch(errorHandler);
		}
		const serverCount = serverManager.getServerCount();
		if (serverCount === 0) {
			return interaction.reply({
				content: "No servers available",
				flags: [MessageFlags.Ephemeral],
			});
		}
		let server: Server;
		if (serverCount === 1) {
			const servers = serverManager.getAllServerEntries();
			if (!servers[0]) {
				return interaction.reply({
					content: "No servers available",
					flags: [MessageFlags.Ephemeral],
				});
			}
			server = servers[0][1];
		} else {
			const reply = await interaction.reply({
				content: "Please select a server:",
				components: [
					createServerSelectionMenu(serverManager.getAllTagPairs()),
				],
			});
			try {
				const selection = await reply.awaitMessageComponent({
					time: 60000,
					filter: (i) => i.user.id === interaction.user.id,
					componentType: ComponentType.StringSelect,
				});
				const serverId = selection.values[0];
				if (!serverId) {
					return selection.update({
						content: "No server selected",
						components: [],
					});
				}
				const selectedServer = serverManager.getServer(
					parseInt(serverId),
				);
				if (!selectedServer) {
					return selection.update({
						content: "Selected server not found",
						components: [],
					});
				}
				server = selectedServer;
				await selection.update({
					content: "Server selected",
					components: [],
				});
			} catch (e) {
				return interaction.editReply({
					content: "No server selected in time",
					components: [],
				});
			}
		}

		if (
			server.suspendingEvent.isSuspending() &&
			!comparePermission(
				await readPermission(interaction.user),
				PermissionFlags.suspend,
			)
		) {
			return interaction.reply({
				content:
					"Server is suspending, you do not have permission to use this command",
				flags: [MessageFlags.Ephemeral],
			});
		}
		await Promise.try(() =>
			command.execute({ interaction, client, server }),
		).catch(errorHandler);
	} else if (interaction.isMessageComponent() && interaction.isButton()) {
		if (
			interaction.user.bot ||
			!compareAllPermissions(await readPermission(interaction.user), [
				PermissionFlags.use,
			])
		)
			return;
		if (isApprovalMessageComponentId(interaction.customId)) {
			return updateApprovalMessage(serverManager, interaction);
		}
	}
});

setInterval(updateDnsRecord, 24 * 60 * 60 * 1000);
updateDnsRecord();

const timeBeforeFirstRun =
	getNextTimestamp({ hour: 14, minute: 0 }).getTime() - Date.now();

setTimeout(async () => {
	const func = async () => {
		const giftAmount = settings.dailyGift;
		if (giftAmount <= 0) return;
		const users = await getUsersWithMatchedPermission(PermissionFlags.gift);
		for (const userId of users) {
			if (settings.giftMax > 0) {
				const credit = await getCredit(userId);
				if (!credit || credit.currentCredit > settings.giftMax)
					continue;
			}

			console.log(`Gifted ${userId} ${giftAmount} credits`);
			await changeCredit({
				userId,
				change: giftAmount,
				reason: "Daily Gift",
			});
			const user = await client.users.fetch(userId).catch(() => null);
			if (user) {
				await sendCreditNotification({
					user,
					creditChanged: giftAmount,
					reason: "Daily Gift",
					silent: true,
				});
			}
		}
	};
	setInterval(func, 24 * 60 * 60 * 1000);
	await func();
}, timeBeforeFirstRun);

console.log(`Time before first run: ${Math.round(timeBeforeFirstRun / 1000)}s`);

process.on("unhandledRejection", (reason) => {
	console.error("Unhandled Rejection:", reason);
});
process.on("uncaughtException", (error) => {
	console.error("Uncaught Exception:", error);
});

process.on("SIGINT", async () => {
	await serverManager
		.exitAllServers(client)
		.catch((err) => console.error("Error occurred before exit:", err));
	process.exit(64);
});

process.on("beforeExit", async (code) => {
	if (code === 64) return;
	await serverManager
		.exitAllServers(client)
		.catch((err) => console.error("Error occurred before exit:", err));
	process.exit(code);
});

process.on("exit", async (code) => {
	console.log(`Process exited with code ${code}`);
	process.exit(code);
});

client.login(process.env.TOKEN);
