import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/discordCommands";
import { serverManager } from "../lib/server";
import { comparePermission, PermissionFlags, readPermission } from "../lib/permission";
import { sendApprovalPoll } from "../lib/approval";
import { isServerAlive } from "../lib/request";

export default {
    command: new SlashCommandBuilder()
        .setName("cancelstopserver")
        .setDescription("Cancel stop the server"),
    async execute(interaction, client) {
        if (!await isServerAlive()) return await interaction.reply({ content: "Server is offline", flags: [MessageFlags.Ephemeral] })
        if (!await serverManager.haveServerSideScheduledShutdown()) return await interaction.reply({ content: "No scheduled shutdown found", flags: [MessageFlags.Ephemeral] })
        
            if (comparePermission(await readPermission(interaction.user.id), PermissionFlags.stopServer)) {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
            const success = await serverManager.cancelServerSideShutdown()
            if (!success) {
                await interaction.editReply({ content: "No scheduled shutdown found" });
                return
            }
            serverManager.cancelLocalScheduledShutdown()
            return await interaction.editReply({ content: 'Cancelled scheduled shutdown' })
        }

        sendApprovalPoll(interaction, {
            content: "Cancel Server Shutdown",
            options: {
                description: "Cancel Server Shutdown",
                async onSuccess() {
                    const success = await serverManager.cancelServerSideShutdown()
                    if (!success) {
                        await interaction.editReply({ content: "No scheduled shutdown found" });
                        return
                    }
                    serverManager.cancelLocalScheduledShutdown()
                    await interaction.editReply({ content: 'Cancelled scheduled shutdown' });
                },
                approvalCount: 1,
                disapprovalCount: 4,
            }
        })
    }
} as CommandFile