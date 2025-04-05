import { Client, EmbedBuilder, GatewayIntentBits, MessageFlags, userMention } from 'discord.js'
import { loadCommands } from './lib/commands'
import { comparePermission, PermissionFlags, readPermission } from './lib/permission'
import { updateDnsRecord } from './lib/dnsRecord'
import { getApproval, removeApproval } from './lib/approval'
import { runCommandOnServer } from './lib/request'

const commands = loadCommands()

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMessageReactions] })

client.once('ready', () => {
    console.log('Ready!')
})

client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        if (!comparePermission(await readPermission(interaction.user.id), [PermissionFlags.use])) {
            return interaction.reply({ content: 'You do not have permission to use this command', flags: [MessageFlags.Ephemeral] })
        }
        const { commandName } = interaction
        const command = commands.find(cmd => cmd.command.name === commandName)
        if (!command) return interaction.reply({ content: 'Command not found', flags: [MessageFlags.Ephemeral] })
        await Promise.try(() => command.execute(interaction, client))
            .catch(err => {
                console.error(err)
                interaction.reply({ content: 'An error occurred while executing the command', flags: [MessageFlags.Ephemeral] }).catch(console.error)
            })
    }
})

client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return
    const approval = getApproval(reaction.message.id)
    if (!approval) return
    const approving = reaction.emoji.name === '✅'
    const userReactions = reaction.message.reactions.cache.filter(r => r.users.cache.has(user.id))
    for (const userReaction of userReactions.values()) {
        await userReaction.users.remove(user.id).catch(console.error);
    }
    if (!comparePermission(await readPermission(user.id), [PermissionFlags.approve])) return
    if (approving) {
        const success = await runCommandOnServer(approval.command)
        if (!success) {
            return reaction.message.reply("An error occurred while running the command on the server")
        }
        const embed = new EmbedBuilder()
        .setTitle('Success')
        .setColor(0x00FF00)
        .setDescription("Command executed successfully")
        .addFields(
            { name: 'Command', value: approval.command },
            { name: 'Execution', value: 'Command executed successfully' },
        )
        await reaction.message.reply({ embeds: [embed] });
        removeApproval(approval.messageId)
    } else {
        const embed = new EmbedBuilder()
        .setTitle('Rejected')
        .setColor(0xFF0000)
        .setDescription("Command rejected")
        .addFields(
            { name: 'Command', value: approval.command },
            { name: 'Rejection', value: `${userMention(user.id)} has rejected the command!` },
        )
        await reaction.message.reply({ embeds: [embed] });
        removeApproval(approval.messageId)
    }
    await reaction.message.reactions.removeAll()
})

setInterval(updateDnsRecord, 24 * 60 * 60 * 1000);
updateDnsRecord()

client.login(process.env.TOKEN)