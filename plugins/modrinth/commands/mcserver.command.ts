import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../../../lib/commandFile";
import { PermissionFlags } from "../../../lib/permission";

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
