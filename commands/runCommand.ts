import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/discordCommands";
import { compareAllPermissions, PermissionFlags, readPermission } from "../lib/permission";
import { sendApprovalPoll } from "../lib/approval";
import { parseCommandOutput, runCommandOnServer } from "../lib/request";
import { serverManager } from "../lib/server";

export default {
    command: new SlashCommandBuilder()
        .setName("runcommand")
        .setDescription("Run a command on the server")
        .addStringOption(option =>
            option.setName("command")
                .setDescription("The command to run")
                .setRequired(true)
        )
        .addBooleanOption(option =>
            option.setName("poll")
                .setDescription("Use poll")
                .setRequired(false)
        )
        .addIntegerOption(option =>
            option.setName("timeout")
                .setDescription("Timeout in milliseconds")
                .setRequired(false)
                .setMinValue(100)
                .setMaxValue(60000)
        ),
    async execute(interaction, client) {
        const command = interaction.options.getString("command", true)
        const force = interaction.options.getBoolean("poll") === false
        const timeout = interaction.options.getInteger("timeout") ?? 1000
        const canRunCommand = compareAllPermissions(await readPermission(interaction.user.id), [PermissionFlags.runCommand])

        if (!canRunCommand || !force) {
            return await sendApprovalPoll(interaction, {
                content: command,
                options: {
                    description: `Command: \`${command}\``,
                    async onSuccess(approval, message) {
                        const { success } = await runCommandOnServer(approval.content)
                        const output = await serverManager.captureSomeOutput(timeout)
                        if (!success) {
                            await message.reply("Failed to run command")
                            return
                        }
                        await message.reply(parseCommandOutput(output?.join('\n') || null, success))
                    },
                }
            })
        }
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] })
        const { success } = await runCommandOnServer(command)
        const output = await serverManager.captureLastLineOfOutput()
        await interaction.editReply(parseCommandOutput(output?.message || null, success))
    },
} as CommandFile