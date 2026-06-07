require("dotenv").config();

const {
    REST,
    Routes,
    SlashCommandBuilder
} = require("discord.js");

const commands = [
    new SlashCommandBuilder()
        .setName("attendance")
        .setDescription(
            "Mark today's attendance"
        )
        .toJSON()
];

const commands2 = [
    new SlashCommandBuilder()
        .setName('leave')
        .setDescription('Apply for leave')
].map(c => c.toJSON());

const rest = new REST({
    version: "10"
}).setToken(process.env.TOKEN);

(async () => {

    await rest.put(
        Routes.applicationGuildCommands(
            process.env.CLIENT_ID,
            "1512864338145185822"
        ),
        { body: commands }
    );

    console.log("Commands Registered");

})();