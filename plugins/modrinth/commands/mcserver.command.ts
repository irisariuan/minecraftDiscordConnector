import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../../../lib/commandFile";
import { PermissionFlags } from "../../../lib/permission";
import { getPaperProject } from "../../../lib/serverInstance/jar";
import { trimTextWithSuffix } from "../../../lib/utils";
import {
	FORGE_PROMOTIONS_URL,
	getFabricGameVersions,
	getMojangReleaseVersions,
} from "../lib";
import type { ForgePromotions } from "../types";
import { createHandler, createSubcommandBuilder } from "./mcserver/create";
import { upgradeHandler, upgradeSubcommandBuilder } from "./mcserver/upgrade";

export default {
	command: new SlashCommandBuilder()
		.setName("mcserver")
		.setDescription("Create or upgrade a Minecraft server")
		// ── create subcommand ──────────────────────────────────────────────
		.addSubcommand(createSubcommandBuilder)
		// ── upgrade subcommand ─────────────────────────────────────────────
		.addSubcommand(upgradeSubcommandBuilder),

	requireServer: false,
	permissions: PermissionFlags.editSetting,

	// ─── Autocomplete ────────────────────────────────────────────────────────
	async autoComplete({ interaction, serverManager }) {
		const sub = interaction.options.getSubcommand(true);
		const focused = interaction.options.getFocused(true);

		// Server selector (upgrade)
		if (focused.name === "server" && sub === "upgrade") {
			const query = focused.value.toLowerCase();
			const pairs = serverManager.getAllTagPairs();
			return interaction.respond(
				pairs
					.filter((p) =>
						query
							? String(p.id).includes(query) ||
								(p.tag ?? "").toLowerCase().includes(query)
							: true,
					)
					.slice(0, 25)
					.map((p) => ({
						name: trimTextWithSuffix(
							`${p.tag ?? `Server #${p.id}`} (ID: ${p.id})`,
							100,
						),
						value: String(p.id),
					})),
			);
		}

		// Version autocomplete
		if (focused.name === "minecraftversion" || focused.name === "version") {
			const query = focused.value.toLowerCase();
			const serverType =
				interaction.options.getString("servertype") ??
				(focused.name === "version"
					? (() => {
							const sid = parseInt(
								interaction.options.getString("server") ?? "",
							);
							const sv = isNaN(sid)
								? null
								: serverManager.getServer(sid);
							return sv?.config.loaderType ?? null;
						})()
					: null);

			let versions: string[] = [];

			if (!serverType || serverType === "vanilla") {
				versions = await getMojangReleaseVersions().catch(() => []);
			} else if (serverType === "paper") {
				const proj = await getPaperProject("paper").catch(() => null);
				if (proj) {
					versions = Object.values(proj.versions)
						.flat()
						.filter((v, i, a) => a.indexOf(v) === i);
				}
			} else if (serverType === "fabric") {
				versions = await getFabricGameVersions().catch(() => []);
			} else if (serverType === "forge") {
				const res = await fetch(FORGE_PROMOTIONS_URL).catch(() => null);
				if (res?.ok) {
					const data = (await res.json()) as ForgePromotions;
					versions = [
						...new Set(
							Object.keys(data.promos).map((k) =>
								k.replace(/-recommended$|-latest$/, ""),
							),
						),
					];
				}
			}

			const filtered = versions
				.filter((v) => (query ? v.toLowerCase().includes(query) : true))
				.slice(0, 25);
			return interaction.respond(
				filtered.map((v) => ({ name: v, value: v })),
			);
		}

		return interaction.respond([]);
	},

	// ─── Execute ─────────────────────────────────────────────────────────────
	async execute(params) {
		const { interaction } = params;
		const sub = interaction.options.getSubcommand(true);
		switch (sub) {
			case "create":
				return await createHandler(params);
			case "upgrade":
				return await upgradeHandler(params);
		}

		return interaction.reply({
			content: "Unknown subcommand.",
			flags: MessageFlags.Ephemeral,
		});
	},
} satisfies CommandFile<false>;
