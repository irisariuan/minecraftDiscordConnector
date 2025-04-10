import 'dotenv/config'
import { ActivityType, Client, GatewayIntentBits, MessageFlags, userMention } from 'discord.js'
import { loadCommands } from './lib/discordCommands'
import { compareAllPermissions, compareAnyPermissions, comparePermission, PermissionFlags, readPermission } from './lib/permission'
import { updateDnsRecord } from './lib/dnsRecord'
import { globalApprovalCount, approve, createApprovalEmbed, globalDisapprovalCount, disapprove, getApproval, updateApprovalMessage } from './lib/approval'
import { serverManager } from './lib/server'
import { MINECRAFT_VERSION } from './lib/plugin'

const commands = await loadCommands()

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMessageReactions] })

client.once('ready', () => {
    console.log('Ready!')
    client.user?.setActivity({
        name: 'Minecraft Server Offline',
        type: ActivityType.Watching,
    })
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
    updateApprovalMessage(reaction, user)
})

serverManager.isOnline.cacheEvent.on('update', data => {
    console.log('Server online status updated:', data)
    if (!data) {
        return client.user?.setActivity({ name: 'Minecraft Server Offline', type: ActivityType.Watching })
    }
    client.user?.setActivity({ name: `Minecraft ${MINECRAFT_VERSION} Server`, type: ActivityType.Playing })
})

setInterval(updateDnsRecord, 24 * 60 * 60 * 1000);
updateDnsRecord()

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason)
})
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error)
})

process.on('SIGINT', async () => {
    const { success, promise } = await serverManager.stop(0)
    if (success) {
        console.log('Server process shutting down')
        await promise
        console.log('Server process stopped')
    }
    process.exit(64)
})

process.on('beforeExit', async code => {
    if (code === 64) return
    const { success, promise } = await serverManager.stop(0)
    if (success) {
        console.log('Server process shutting down')
        await promise
        console.log('Server process stopped')
    }
    process.exit(code)
})

process.on('exit', async code => {
    console.log(`Process exited with code ${code}`)
    process.exit(code)
})

client.login(process.env.TOKEN)