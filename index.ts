import { Client, GatewayIntentBits } from 'discord.js'
import { loadCommands } from './lib/commands'

const commands = loadCommands()

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] })

client.once('ready', () => {
    console.log('Ready!')
})

client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction
        const command = commands.find(cmd => cmd.command.name === commandName)
        if (!command) return interaction.reply({ content: 'Command not found', ephemeral: true })
        await command.execute(interaction, client)
    }
})

client.login(process.env.TOKEN)