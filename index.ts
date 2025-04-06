import 'dotenv/config'
import { Client, GatewayIntentBits, MessageFlags, userMention } from 'discord.js'
import { loadCommands } from './lib/commands'
import { compareAllPermissions, compareAnyPermissions, comparePermission, PermissionFlags, readPermission } from './lib/permission'
import { updateDnsRecord } from './lib/dnsRecord'
import { approve, createApprovalEmbed, disapprove, getApproval } from './lib/approval'
import { parseCommandOutput, runCommandOnServer } from './lib/request'

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
    const userPerm = await readPermission(user.id)
    const approving = reaction.emoji.name === '✅' || reaction.emoji.name === '🏁'
    const disapproving = reaction.emoji.name === '❌' || reaction.emoji.name === '🏳️'
    const canceling = reaction.emoji.name === '📤'
    const superApprove = reaction.emoji.name === '🏁' || reaction.emoji.name === '🏳️'
    const canSuperApprove = comparePermission(userPerm, PermissionFlags.superApprove)

    const userReactions = reaction.message.reactions.cache.filter(r => r.users.cache.has(user.id))
    for (const userReaction of userReactions.values()) {
        await userReaction.users.remove(user.id).catch(console.error);
    }
    if (!compareAnyPermissions(userPerm, [PermissionFlags.approve, PermissionFlags.superApprove])) return
    if (canceling) {
        const prevCount = approval.approvalCount.length + approval.disapprovalCount.length
        approval.approvalCount = approval.approvalCount.filter(id => id !== user.id)
        approval.disapprovalCount = approval.disapprovalCount.filter(id => id !== user.id)
        if (prevCount === approval.approvalCount.length + approval.disapprovalCount.length) {
            return reaction.message.reply({ content: 'You have not approved or disapproved this command' }).catch(console.error)
        }
        if (reaction.message.editable) {
            await reaction.message.edit({
                embeds: [createApprovalEmbed(approval)]
            }).catch(console.error)
        }
        return await reaction.message.reply({
            content: `Command approval canceled by ${userMention(user.id)}`,
        }).catch(console.error)
    }
    if (approving && approval.approvalCount.includes(user.id) && !(superApprove && canSuperApprove)) {
        return await reaction.message.reply({ content: 'You have already approved this command' }).catch(console.error)
    }
    if (disapproving && approval.disapprovalCount.includes(user.id) && !(superApprove && canSuperApprove)) {
        return await reaction.message.reply({ content: 'You have already disapproved this command' }).catch(console.error)
    }

    // Check if the user is already in the opposite list and remove them
    if (disapproving && approval.approvalCount.includes(user.id) && !(superApprove && canSuperApprove)) {
        approval.approvalCount = approval.approvalCount.filter(id => id !== user.id)
    } else if (approving && approval.disapprovalCount.includes(user.id) && !(superApprove && canSuperApprove)) {
        approval.disapprovalCount = approval.disapprovalCount.filter(id => id !== user.id);
    }

    const status = approving ? approve(reaction.message.id, user.id, canSuperApprove && superApprove) : disapprove(reaction.message.id, user.id, canSuperApprove && superApprove)

    if (reaction.message.editable) {
        await reaction.message.edit({
            embeds: [createApprovalEmbed(approval)]
        }).catch(console.error)
    }

    await reaction.message.reply({
        content: `Command ${approving ? 'approved' : 'disapproved'} by ${userMention(user.id)}${canSuperApprove && superApprove ? ' (forced)' : ''}`,
    }).catch(console.error)

    if (status !== 'pending') {
        await reaction.message.reactions.removeAll()
    } else {
        return
    }

    if (status === 'approved') {
        const { output, success } = await runCommandOnServer(approval.command)
        return await reaction.message.reply({
            content: parseCommandOutput(output, success),
        })
    }
    if (status === 'disapproved') {
        return await reaction.message.reply({
            content: `The command \`${approval.command}\` has been disapproved.`,
        }).catch(console.error)
    }
    await reaction.message.reply({
        content: `The command \`${approval.command}\` has timed out.`,
    }).catch(console.error)
})

setInterval(updateDnsRecord, 24 * 60 * 60 * 1000);
updateDnsRecord()

client.login(process.env.TOKEN)