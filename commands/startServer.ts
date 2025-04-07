import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/commands";
import { serverManager } from "../lib/server";
import { comparePermission, PermissionFlags, readPermission } from "../lib/permission";
import { sendApprovalPoll } from "../lib/approval";
import { isServerAlive } from "../lib/request";

export default {
    command: new SlashCommandBuilder()
        .setName("startserver")
        .setDescription("Start the server"),
    async execute(interaction) {
        if (await isServerAlive()) return await interaction.reply({ content: "Server is already online", flags: [MessageFlags.Ephemeral] })

        if (comparePermission(await readPermission(interaction.user.id), PermissionFlags.startServer)) {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
            const pid = await serverManager.start()
            if (!pid) {
                return await interaction.editReply({ content: "Server is already online" });
            }
            console.log(`Server started with PID ${pid}`);
            await interaction.editReply({ content: 'Server started successfully' });
        }

        sendApprovalPoll(interaction, {
            content: "Start Server",
            options: {
                description: 'Start Server',
                async onSuccess() {
                    const pid = await serverManager.start()
                    if (!pid) {
                        await interaction.followUp({ content: "Server is already online" });
                        return
                    }
                    console.log(`Server started with PID ${pid}`);
                    await interaction.followUp({ content: 'Server started successfully' });
                },
                approvalCount: 2,
                disapprovalCount: 4
            }
        })
    }
} as CommandFile