import { EmbedBuilder, MessageFlags, SlashCommandBuilder, time } from "discord.js";
import type { CommandFile } from "../lib/commands";
import { comparePermission, PermissionFlags, readPermission } from "../lib/permission";
import { newApproval } from "../lib/approval";
import { runCommandOnServer } from "../lib/request";

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

        if (!comparePermission(await readPermission(interaction.user.id), [PermissionFlags.runCommand])) {
            const validTill = Date.now() + 1000 * 60 * 60 * 2 // 2 hours
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('Require Approval')
                .setDescription(`This command requires approval, valid until ${time(new Date(validTill))}`)
                .addFields(
                    { name: 'Command', value: command },
                )
            const message = await interaction.reply({ embeds: [embed], withResponse: true })
            if (!message.resource?.message?.id) {
                return interaction.editReply({ content: "Unknown error occurred" })
            }
            newApproval({
                command,
                messageId: message.resource?.message?.id,
                validTill,
            })
            console.log(`Approval added for command ${command} with message id ${message.resource?.message?.id}`)
            await message.resource.message.react('✅')
            await message.resource.message.react('❌')
            return
        }
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] })
        const success = await runCommandOnServer(command)
        if (!success) {
            return interaction.editReply("An error occurred while running the command on the server")
        }
        await interaction.editReply("Command executed successfully")
    },
} as CommandFile