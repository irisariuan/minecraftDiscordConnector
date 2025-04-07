import 'dotenv/config'
import { ActivityType, Client, GatewayIntentBits, MessageFlags, userMention } from 'discord.js'
import { loadCommands } from './lib/commands'
import { compareAllPermissions, compareAnyPermissions, comparePermission, PermissionFlags, readPermission } from './lib/permission'
import { updateDnsRecord } from './lib/dnsRecord'
import { globalApprovalCount, approve, createApprovalEmbed, globalDisapprovalCount, disapprove, getApproval } from './lib/approval'
import { serverManager } from './lib/server'

const DELETE_AFTER_MS = 3 * 1000

const commands = await loadCommands()

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
    const userPerm = await readPermission(user.id)
    const approving = reaction.emoji.name === '✅' || reaction.emoji.name === '🏁'
    const disapproving = reaction.emoji.name === '❌' || reaction.emoji.name === '🏳️'
    const canceling = reaction.emoji.name === '📤'
    const superApprove = reaction.emoji.name === '🏁' || reaction.emoji.name === '🏳️'
    const isValidReaction = ['✅', '❌', '🏁', '🏳️', '📤'].includes(reaction.emoji.name || '')
    const canSuperApprove = comparePermission(userPerm, PermissionFlags.superApprove)

    const userReactions = reaction.message.reactions.cache.filter(r => r.users.cache.has(user.id))
    for (const userReaction of userReactions.values()) {
        await userReaction.users.remove(user.id).catch(console.error);
    }
    if (!isValidReaction || !compareAnyPermissions(userPerm, [PermissionFlags.approve, PermissionFlags.superApprove])) return
    if (canceling) {
        const prevCount = approval.approvalIds.length + approval.disapprovalIds.length
        approval.approvalIds = approval.approvalIds.filter(id => id !== user.id)
        approval.disapprovalIds = approval.disapprovalIds.filter(id => id !== user.id)
        if (prevCount === approval.approvalIds.length + approval.disapprovalIds.length) {
            return reaction.message.reply({ content: 'You have not approved or disapproved this poll', flags: [MessageFlags.SuppressNotifications] })
                .catch(console.error)
                .then(msg => setTimeout(() => msg?.delete().catch(console.error), DELETE_AFTER_MS))
        }
        if (reaction.message.editable) {
            await reaction.message.edit({
                embeds: [createApprovalEmbed(approval)]
            }).catch(console.error)
        }
        return await reaction.message.reply({
            content: `Cancelled by ${userMention(user.id)}`,
            flags: [MessageFlags.SuppressNotifications]
        })
            .catch(console.error)
            .then(msg => setTimeout(() => msg?.delete().catch(console.error), DELETE_AFTER_MS))
    }
    if (approving && approval.approvalIds.includes(user.id) && !(superApprove && canSuperApprove)) {
        return await reaction.message.reply({ content: 'You have already approved this poll', flags: [MessageFlags.SuppressNotifications] })
            .catch(console.error)
            .then(msg => setTimeout(() => msg?.delete().catch(console.error), DELETE_AFTER_MS))
    }
    if (disapproving && approval.disapprovalIds.includes(user.id) && !(superApprove && canSuperApprove)) {
        return await reaction.message.reply({ content: 'You have already disapproved this poll', flags: [MessageFlags.SuppressNotifications] })
            .catch(console.error)
            .then(msg => setTimeout(() => msg?.delete().catch(console.error), DELETE_AFTER_MS))
    }

    // Check if the user is already in the opposite list and remove them
    if (disapproving && approval.approvalIds.includes(user.id) && !(superApprove && canSuperApprove)) {
        approval.approvalIds = approval.approvalIds.filter(id => id !== user.id)
    } else if (approving && approval.disapprovalIds.includes(user.id) && !(superApprove && canSuperApprove)) {
        approval.disapprovalIds = approval.disapprovalIds.filter(id => id !== user.id);
    }

    const status = approving ? approve(reaction.message.id, user.id, canSuperApprove && superApprove) : disapprove(reaction.message.id, user.id, canSuperApprove && superApprove)

    if (reaction.message.editable) {
        await reaction.message.edit({
            embeds: [createApprovalEmbed(approval)]
        }).catch(console.error)
    }

    const countStr = approving ? `${approval.approvalIds.length}/${approval.options.approvalCount || globalApprovalCount}` : `${approval.disapprovalIds.length}/${approval.options.disapprovalCount || globalDisapprovalCount}`

    await reaction.message.reply({
        content: `${approving ? 'Approved' : 'Disapproved'} by ${userMention(user.id)} ${canSuperApprove && superApprove ? `(forced, ${countStr}) ` : `(${countStr})`}`,
    }).catch(console.error)

    if (status !== 'pending') {
        await reaction.message.reactions.removeAll()
    } else {
        return
    }

    if (status === 'approved') {
        return await approval.options.onSuccess(approval, reaction.message)
    }
    if (status === 'disapproved') {
        await approval.options.onFailure?.(approval, reaction.message)
        return await reaction.message.reply({
            content: `The poll \`${approval.content}\` has been disapproved.`,
        }).catch(console.error)
    }
    await approval.options.onTimeout?.(approval, reaction.message)
    await reaction.message.reply({
        content: `The poll \`${approval.content}\` has timed out.`,
    }).catch(console.error)
})

serverManager.isOnline.cacheEvent.on('update', data => {
    console.log('Server online status updated:', data)
    client.user?.setActivity({
        name: data ? 'Server Online' : 'Server Offline',
        type: data ? ActivityType.Playing : ActivityType.Watching,
    })
})

setInterval(updateDnsRecord, 24 * 60 * 60 * 1000);
updateDnsRecord()

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason)
})
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error)
    process.exit(1)
})

client.login(process.env.TOKEN)