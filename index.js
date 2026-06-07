require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client, GatewayIntentBits, Collection, REST, Routes } = require("discord.js");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

client.commands = new Collection();

// 1. Read commands from directory dynamically
const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".js"));

const commandsData = [];

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if (command.data && command.execute) {
        client.commands.set(command.data.name, command);
        commandsData.push(command.data.toJSON());
    } else {
        console.warn(`[WARNING] Command at ${filePath} is missing a required "data" or "execute" property.`);
    }
}

// 2. Read events dynamically
const eventsPath = path.join(__dirname, "events");
if (fs.existsSync(eventsPath)) {
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith(".js"));
    for (const file of eventFiles) {
        const filePath = path.join(eventsPath, file);
        const event = require(filePath);
        if (event.name && event.execute) {
            if (event.once) {
                client.once(event.name, (...args) => event.execute(...args));
            } else {
                client.on(event.name, (...args) => event.execute(...args));
            }
        }
    }
}

// 3. Register Slash Commands via REST
const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
    try {
        console.log(`Registering ${commandsData.length} application (/) commands...`);

        const guildId = process.env.GUILD_ID || "1512864338145185822";
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
            { body: commandsData }
        );

        console.log("✅ Commands Registered Successfully");
    } catch (error) {
        console.error("❌ Error registering commands:", error);
    }
})();

// 4. Log in to Discord
client.login(process.env.TOKEN);