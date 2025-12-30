import { input } from "@inquirer/prompts";
import {
	Client,
	ComponentType,
	GatewayIntentBits,
	MessageFlags,
} from "discord.js";
import "dotenv/config";
import { updateApprovalMessage } from "./lib/approval";
import {
	doNotRequireServer,
	getAllRegisteredCommandNames,
	loadCommands,
	registerCommands,
} from "./lib/commandFile";
import { isApprovalMessageComponentId } from "./lib/component/approval";
import { changeCredit, getCredit, sendCreditNotification } from "./lib/credit";
import { createServer, hasAnyServer } from "./lib/db";
import { updateDnsRecord } from "./lib/dnsRecord";
import { createServerSelectionMenu } from "./lib/component/server";
import {
	compareAllPermissions,
	comparePermission,
	getUsersWithMatchedPermission,
	PermissionFlags,
	readPermission,
} from "./lib/permission";
import { createServerManager, Server } from "./lib/server";
import { serverConfig } from "./lib/server/plugin";
import {
	changeCreditSettings,
	loadCreditSettings,
	settings,
} from "./lib/settings";
import { compareArrays, getNextTimestamp } from "./lib/utils";
import { TOKEN } from "./lib/env";

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
		port: serverConfig.port,
		tag: "Default Server",
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
if (
	!compareArrays(
		(await getAllRegisteredCommandNames()) ?? [],
		commands.map((v) => v.command.name),
	)
) {
	console.log("Updating registered commands...");
	await registerCommands(commands);
	console.log("Registered commands");
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
				.catch(() => {
					interaction
						.editReply({
							content:
								"An error occurred while executing the command",
						})
						.catch(() => {
							interaction.followUp({
								content:
									"An error occurred while executing the command",
							});
						});
				});
		};

		if (doNotRequireServer(command)) {
			return await Promise.try(() =>
				command.execute({ interaction, client, serverManager }),
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
			await interaction.deferReply({
				flags: command.ephemeral ? [MessageFlags.Ephemeral] : [],
			});
		} else {
			const reply = await interaction.reply({
				content: "Please select a server:",
				components: [
					createServerSelectionMenu(serverManager.getAllTagPairs()),
				],
				flags: command.ephemeral ? [MessageFlags.Ephemeral] : [],
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
					content: "Loading...",
					components: [],
				});
				await selection.followUp({
					content: `Selected ${server.config.tag || `*Server #${server.id}*`}`,
					flags: command.ephemeral ? [MessageFlags.Ephemeral] : [],
				});
			} catch (e) {
				return await interaction.editReply({
					content: "No server selected in time or an error occurred",
					components: [],
				});
			}
		}
		if (
			command.features?.unsuspendable &&
			server.suspendingEvent.isSuspending() &&
			!comparePermission(
				await readPermission(interaction.user, server.id),
				PermissionFlags.suspend,
			)
		) {
			return await interaction.reply({
				content:
					"Server is suspending, you do not have permission to use this command",
				flags: [MessageFlags.Ephemeral],
			});
		}
		if (
			command.features?.supportedPlatforms &&
			command.features.supportedPlatforms.length > 0 &&
			!command.features.supportedPlatforms.includes(server.gameType)
		) {
			return await interaction.reply({
				content: `This command is not supported on \`${server.gameType}\` servers`,
				flags: [MessageFlags.Ephemeral],
			});
		}
		if (
			command.features?.requireStartedServer &&
			!(await server.isOnline.getData(true))
		) {
			return await interaction.reply({
				content: "Server is not online",
				flags: [MessageFlags.Ephemeral],
			});
		} else if (
			command.features?.requireStoppedServer &&
			(await server.isOnline.getData(true))
		) {
			return await interaction.reply({
				content: "Server is not stopped",
				flags: [MessageFlags.Ephemeral],
			});
		}

		await Promise.try(() =>
			command.execute({ interaction, client, server, serverManager }),
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
	} else if (interaction.isAutocomplete()) {
		const { commandName } = interaction;
		const command = commands.find(
			(cmd) => cmd.command.name === commandName,
		);
		if (!command || !command.autoComplete) {
			console.error(
				"Autocomplete requested but command not found or does not support autocomplete",
			);
			return await interaction.respond([]);
		}
		await Promise.try(() =>
			command.autoComplete?.({ interaction, client, serverManager }),
		).catch((err) => {
			console.error("Error running autocomplete:", err);
		});
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

client.login(TOKEN);
