import 'dotenv/config'
import { Client, GatewayIntentBits, MessageFlags, userMention } from 'discord.js'
import { loadCommands } from './lib/commands'
import { comparePermission, PermissionFlags, readPermission } from './lib/permission'
import { updateDnsRecord } from './lib/dnsRecord'
import { approve, createApprovalEmbed, disapprove, getApproval } from './lib/approval'
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
                interaction.reply({ content: 'An error occurred while executing the command', flags: [MessageFlags.Ephemeral] }).catch(err => {
                    console.error(err)
                    interaction.editReply({ content: 'An error occurred while executing the command' }).catch(console.error)
                })
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
    await reaction.message.reactions.removeAll()

    const status = approving ? approve(reaction.message.id, user.id) : disapprove(reaction.message.id, user.id)

    if (reaction.message.editable) {
        await reaction.message.edit({
            embeds: [createApprovalEmbed(approval)]
        }).catch(console.error)
    }

    await reaction.message.reply({
        content: `Command ${approving ? 'approved' : 'disapproved'} by ${userMention(user.id)}`,
        embeds: [],
    }).catch(console.error)

    if (status === 'approved') {
        await runCommandOnServer(approval.command)
        console.log(`Command \`${approval.command}\` has been executed successfully.`)
        await reaction.message.reply({
            content: `The command \`${approval.command}\` has been executed.`,
            embeds: [],
        }).catch(console.error)
    } else if (status === 'disapproved') {
        await reaction.message.reply({
            content: `The command \`${approval.command}\` has been disapproved.`,
            embeds: [],
        }).catch(console.error)
    } else if (status === 'timeout') {
        await reaction.message.reply({
            content: `The command \`${approval.command}\` has timed out.`,
            embeds: [],
        }).catch(console.error)
    }
})

setInterval(updateDnsRecord, 24 * 60 * 60 * 1000);
updateDnsRecord()

client.login(process.env.TOKEN)