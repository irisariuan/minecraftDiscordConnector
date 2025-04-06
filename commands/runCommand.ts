import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/commands";
import { compareAllPermissions, PermissionFlags, readPermission } from "../lib/permission";
import { sendApprovalPoll } from "../lib/approval";
import { parseCommandOutput, runCommandOnServer } from "../lib/request";

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
        ),
    async execute(interaction, client) {
        const command = interaction.options.getString("command", true)
        const force = interaction.options.getBoolean("poll") === false
        const canRunCommand = compareAllPermissions(await readPermission(interaction.user.id), [PermissionFlags.runCommand])

        if (!canRunCommand || !force) {
            return await sendApprovalPoll(interaction, {
                content: command,
                options: {
                    description: `Command: \`${command}\``,
                    async onSuccess(approval, message) {
                        const { success, output } = await runCommandOnServer(approval.content)
                        await message.reply(parseCommandOutput(output, success))
                    },
                }
            })
        }
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] })
        const { success, output } = await runCommandOnServer(command)
        await interaction.editReply(parseCommandOutput(output, success))
    },
} as CommandFile