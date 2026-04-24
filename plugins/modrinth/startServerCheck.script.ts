import { pluginEvents } from "../../lib/pluginEvent";
import { buildOutdatedPluginsEmbed, checkOutdatedPlugins } from "./lib";

/**
 * Plugin script: whenever `/startserver` is invoked, run a non-blocking
 * outdated-plugin check and post the result embed to the same channel.
 */
export default function run() {
	pluginEvents.on("commandCalled", async ({ commandName, interaction, server }) => {
		if (commandName !== "startserver") return;
		if (!server) return;

		const { outdated, failed } = await checkOutdatedPlugins(server).catch(
			(err) => {
				console.error("[modrinth] checkOutdatedPlugins failed:", err);
				return { outdated: [], failed: [] };
			},
		);

		const embed = buildOutdatedPluginsEmbed(
			outdated,
			failed,
			server.config.tag ?? `Server #${server.id}`,
		);
		if (!embed) return;

		if (interaction.channel?.isSendable()) {
			interaction.channel
				.send({ embeds: [embed] })
				.catch((err) =>
					console.error("[modrinth] failed to send outdated-plugin embed:", err),
				);
		}
	});
}
