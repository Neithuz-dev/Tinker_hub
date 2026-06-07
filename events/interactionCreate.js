module.exports = {
    name: "interactionCreate",

    async execute(interaction) {
        const client = interaction.client;

        // 1. Handle Slash Commands
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(`Error executing command ${interaction.commandName}:`, error);
                try {
                    const errorMessage = {
                        content: "❌ There was an error executing this command.",
                        flags: 64
                    };
                    if (interaction.replied || interaction.deferred) {
                        await interaction.followUp(errorMessage);
                    } else {
                        await interaction.reply(errorMessage);
                    }
                } catch (replyError) {
                    console.error("Could not send error reply (interaction likely expired):", replyError.message);
                }
            }
            return;
        }

        // 2. Handle Button Clicks
        if (interaction.isButton()) {
            if (
                interaction.customId.startsWith("present_") ||
                interaction.customId.startsWith("absent_")
            ) {
                const command = client.commands.get("attendance");
                if (command && typeof command.handleButton === "function") {
                    await command.handleButton(interaction);
                }
            } else if (
                interaction.customId.startsWith("approve_") ||
                interaction.customId.startsWith("reject_")
            ) {
                const command = client.commands.get("leave");
                if (command && typeof command.handleButton === "function") {
                    await command.handleButton(interaction);
                }
            }
            return;
        }

        // 3. Handle Modal Submissions
        if (interaction.isModalSubmit()) {
            if (interaction.customId.startsWith("leaveModal_")) {
                const command = client.commands.get("leave");
                if (command && typeof command.handleModal === "function") {
                    await command.handleModal(interaction);
                }
            }
            return;
        }
    }
};