import {
	channelMention,
	ChannelType,
	EmbedBuilder,
	MessageFlags,
	SlashCommandBuilder,
} from "discord.js";
import {
	comparePermission,
	data,
	PermissionFlags,
	type CommandFile,
} from "../../api";
import {
	getListenPort,
	getVoteChannelId,
	isProxyEnabled,
	listProxiedServers,
	listRecordedWorlds,
	setVoteChannelId,
} from "../runtime/proxySettings";

/**
 * Protocol version numbers as the versions people actually say.
 *
 * Only the versions the proxy can serve a waiting world for are here; anything
 * else is shown as its bare protocol number, which is still enough to look up.
 */
const CLIENT_VERSIONS: Record<number, string> = {
	766: "1.20.5–1.20.6",
	767: "1.21–1.21.1",
	768: "1.21.2–1.21.3",
	769: "1.21.4",
	770: "1.21.5",
	771: "1.21.6",
	772: "1.21.7–1.21.8",
	773: "1.21.9–1.21.10",
	776: "26.2",
};

function describeVersion(protocol: number): string {
	return CLIENT_VERSIONS[protocol] ?? `protocol ${protocol}`;
}

export default {
	command: new SlashCommandBuilder()
		.setName("proxy")
		.setDescription("Inspect and configure the Minecraft proxy")
		.addSubcommand((s) =>
			s
				.setName("status")
				.setDescription("Show the proxy state and the servers it fronts"),
		)
		.addSubcommand((s) =>
			s
				.setName("setchannel")
				.setDescription(
					"Set the channel in-game start votes are posted to",
				)
				.addChannelOption((o) =>
					o
						.setName("channel")
						.setDescription("Channel to post start votes in")
						.addChannelTypes(
							ChannelType.GuildText,
							ChannelType.GuildAnnouncement,
						)
						.setRequired(true),
				),
		)
		.addSubcommand((s) =>
			s
				.setName("clearchannel")
				.setDescription("Stop posting in-game start votes to a channel"),
		),
	requireServer: false,
	async execute({ interaction }) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const subcommand = interaction.options.getSubcommand(true);

		if (subcommand === "status") {
			const [enabled, listenPort, voteChannelId, servers, worlds] =
				await Promise.all([
					isProxyEnabled(),
					getListenPort(),
					getVoteChannelId(),
					listProxiedServers(),
					listRecordedWorlds(),
				]);
			const embed = new EmbedBuilder()
				.setTitle("🛰️ Minecraft Proxy")
				.setColor(enabled ? 0x2ecc71 : 0x95a5a6)
				.addFields(
					{
						name: "Enabled",
						value: enabled
							? "Yes"
							: "No — set `MC_PROXY_ENABLED=true` and restart the bot",
					},
					{ name: "Listen port", value: `\`${listenPort}\`` },
					{
						name: "Vote channel",
						value: voteChannelId
							? channelMention(voteChannelId)
							: "*not configured* — in-game start votes are disabled",
					},
					{
						name: "Waiting room",
						value: worlds.length
							? `Available to ${worlds.map(describeVersion).join(", ")}. Other client versions wait on the connecting screen instead.`
							: "*none yet* — players wait on the connecting screen. Start a server and the proxy takes a waiting room from it within a minute.",
					},
					{
						name: `Proxied servers (${servers.length})`,
						value:
							servers
								.map(
									(server) =>
										`${server.online ? "🟢" : "⚪"} **${server.tag ?? `Server #${server.id}`}** — \`${server.host}:${server.port}\`, forwarding \`${server.forwarding}\``,
								)
								.join("\n") || "*none*",
					},
				);
			return await interaction.editReply({ embeds: [embed] });
		}

		// Both remaining subcommands change persistent configuration.
		if (
			!comparePermission(
				await data.request("permission:read", {
					user: interaction.user.id,
				}),
				PermissionFlags.editSetting,
			)
		) {
			return await interaction.editReply({
				content: "You don't have permission to change proxy settings",
			});
		}

		if (subcommand === "setchannel") {
			const channel = interaction.options.getChannel("channel", true);
			await setVoteChannelId(channel.id);
			return await interaction.editReply({
				content: `In-game start votes will be posted to ${channelMention(channel.id)}`,
			});
		}

		if (subcommand === "clearchannel") {
			await setVoteChannelId(null);
			return await interaction.editReply({
				content:
					"Cleared the in-game start vote channel. Players must now use `/startserver` on Discord.",
			});
		}
	},
} satisfies CommandFile<false>;
