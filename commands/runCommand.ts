import { formatEmoji, MessageFlags, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/commands";
import { compareAllPermissions, PermissionFlags, readPermission } from "../lib/permission";
import { createApprovalEmbed, createEmbed, getApproval, newApproval, removeApproval } from "../lib/approval";
import { parseCommandOutput, runCommandOnServer } from "../lib/request";

export default {
    command: new SlashCommandBuilder()
        .setName("runcommand")
        .setDescription("Run a command on the server")
        .addStringOption(option =>
            option.setName("command")
                .setDescription("The command to run")
                .setRequired(true)
        ),
    async execute(interaction, client) {
        const command = interaction.options.getString("command", true)

        if (!compareAllPermissions(await readPermission(interaction.user.id), [PermissionFlags.runCommand])) {
            const validTill = Date.now() + (Number(process.env.APPROVAL_TIMEOUT) || 1000 * 60 * 60 * 2) // 2 hours
            const embed = createEmbed({
                command,
                validTill,
                approvalCount: [],
                disapprovalCount: [],
            }, 0x0099FF, 'Pending')
            const message = await interaction.reply({ embeds: [embed], withResponse: true })
            if (!message.resource?.message?.id) {
                return interaction.editReply({ content: "Unknown error occurred" })
            }
            newApproval({
                command,
                messageId: message.resource?.message?.id,
                validTill
            }, async () => {
                if (!message.resource?.message?.id) return
                const approval = getApproval(message.resource?.message?.id, false)
                if (!approval) return
                await interaction.editReply({ embeds: [createApprovalEmbed(approval)] })
                removeApproval(message.resource?.message?.id)
            })
            console.log(`Approval added for command ${command} with message id ${message.resource?.message?.id}`)
            await message.resource.message.react('✅')
            await message.resource.message.react('❌')
            await message.resource.message.react('📤')
            await message.resource.message.react('🏁')
            await message.resource.message.react('🏳️')
            return
        }
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] })
        const { success, output } = await runCommandOnServer(command)
        await interaction.editReply(parseCommandOutput(output, success))
    },
} as CommandFile