import 'dotenv/config'
import { Client, GatewayIntentBits, MessageFlags, userMention } from 'discord.js'
import { loadCommands } from './lib/commands'
import { compareAllPermissions, compareAnyPermissions, comparePermission, PermissionFlags, readPermission } from './lib/permission'
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
        if (!compareAllPermissions(await readPermission(interaction.user.id), [PermissionFlags.use])) {
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
    const userPerm = await readPermission(user.id)
    if (!compareAnyPermissions(userPerm, [PermissionFlags.approve, PermissionFlags.superApprove])) return

    if (approving && approval.approvalCount.includes(user.id)) {
        return reaction.message.reply({ content: 'You have already approved this command' }).catch(console.error)
    }
    if (!approving && approval.disapprovalCount.includes(user.id)) {
        return reaction.message.reply({ content: 'You have already disapproved this command' }).catch(console.error)
    }

    // Check if the user is already in the opposite list and remove them
    if (!approving && approval.approvalCount.includes(user.id)) {
        approval.approvalCount = approval.approvalCount.filter(id => id !== user.id)
    } else if (approving && approval.disapprovalCount.includes(user.id)) {
        approval.disapprovalCount = approval.disapprovalCount.filter(id => id !== user.id);
    }

    const status = approving ? approve(reaction.message.id, user.id, comparePermission(userPerm, PermissionFlags.superApprove)) : disapprove(reaction.message.id, user.id, comparePermission(userPerm, PermissionFlags.superApprove))

    if (reaction.message.editable) {
        await reaction.message.edit({
            embeds: [createApprovalEmbed(approval)]
        }).catch(console.error)
    }

    await reaction.message.reply({
        content: `Command ${approving ? 'approved' : 'disapproved'} by ${userMention(user.id)}`,
        embeds: [],
    }).catch(console.error)

    if (status !== 'pending') {
        await reaction.message.reactions.removeAll()
    }

    if (status === 'approved') {
        const { output, success } = await runCommandOnServer(approval.command)
        if (!success) {
            return reaction.message.reply({ content: 'An error occurred while running the command on the server', embeds: [] }).catch(console.error)
        }
        console.log(`Command \`${approval.command}\` has been executed successfully.`)
        await reaction.message.reply({
            content: `The command \`${approval.command}\` has been executed.\nOutput: \`${output}\``,
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