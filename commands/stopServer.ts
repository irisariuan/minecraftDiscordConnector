import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/discordCommands";
import { serverManager } from "../lib/server";
import { comparePermission, PermissionFlags, readPermission } from "../lib/permission";
import { sendApprovalPoll } from "../lib/approval";
import { isServerAlive } from "../lib/request";

export default {
    command: new SlashCommandBuilder()
        .setName("stopserver")
        .setDescription("Stop the server")
        .addIntegerOption(option =>
            option.setName('seconds')
                .setDescription('Delay before stopping the server')
                .setRequired(false)
                .setMinValue(0)
        ),
    async execute(interaction, client) {
        const seconds = interaction.options.getInteger('seconds') ?? 0
        if (!await isServerAlive()) return await interaction.reply({ content: "Server is already offline", flags: [MessageFlags.Ephemeral] })

        if (await serverManager.haveServerSideScheduledShutdown() || await serverManager.haveLocalSideScheduledShutdown()) {
            return await interaction.reply({ content: "Server is already scheduled to shutdown, please cancel it first", flags: [MessageFlags.Ephemeral] })
        }

        if (comparePermission(await readPermission(interaction.user.id), PermissionFlags.stopServer)) {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
            const { success, promise } = await serverManager.stop(seconds * 20)
            if (!success) {
                await interaction.editReply({ content: "Failed to shutdown" });
                return
            }
            if (seconds > 0) {
                promise?.then(() => {
                    interaction.followUp({ content: 'Server stopped successfully' }).catch(console.error);
                })
                return await interaction.editReply({ content: 'Stopping server is scheduled' });
            }
            return await interaction.editReply({ content: 'Server stopped successfully' });
        }
        const displayString = seconds > 0 ? `Stop Server in ${seconds} seconds` : 'Stop Server'

        sendApprovalPoll(interaction, {
            content: displayString,
            options: {
                description: displayString,
                async onSuccess(approval, message) {
                    const { success, promise } = await serverManager.stop(seconds * 20)
                    if (!success) return await message.edit({ content: "Failed to shutdown" });
                    
                    if (seconds > 0) {
                        promise?.then(() => {
                            message.reply({ content: 'Server stopped successfully' }).catch(console.error);
                        })
                        return await message.edit({ content: 'Stopping server is scheduled' });
                    }
                    return await message.edit({ content: 'Server stopped successfully' });
                },
                approvalCount: 2,
                disapprovalCount: 2,
            }
        })
    }
} as CommandFile