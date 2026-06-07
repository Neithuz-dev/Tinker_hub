const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require("discord.js");
const db = require("../database");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("employee-remove")
        .setDescription("Remove an employee from the database (Admin only)")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("The user to remove")
                .setRequired(true)
        ),

    async execute(interaction) {
        // 1. Authorization check
        const isDiscordAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
        const callerRecord = await db.getAsync("SELECT role FROM employees WHERE userId = ?", [interaction.user.id]);
        const isRegisteredAdmin = callerRecord && callerRecord.role === "Admin";

        if (!isDiscordAdmin && !isRegisteredAdmin) {
            return interaction.reply({
                content: "❌ Only administrators can remove employees.",
                ephemeral: true
            });
        }

        const targetUser = interaction.options.getUser("user");

        try {
            // Check if user exists in database
            const existing = await db.getAsync("SELECT * FROM employees WHERE userId = ?", [targetUser.id]);
            if (!existing) {
                return interaction.reply({
                    content: `⚠️ <@${targetUser.id}> is not registered in the employee database.`,
                    ephemeral: true
                });
            }

            // Remove user
            await db.runAsync("DELETE FROM employees WHERE userId = ?", [targetUser.id]);

            const embed = new EmbedBuilder()
                .setTitle("👤 Employee Removed")
                .setColor("#d63031")
                .setDescription(`Successfully removed employee from the database.`)
                .addFields(
                    { name: "Employee", value: `<@${targetUser.id}> (${targetUser.tag})`, inline: true },
                    { name: "Prior Role", value: existing.role, inline: true },
                    { name: "Joined Date", value: existing.joinedDate, inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error("Error removing employee:", error);
            await interaction.reply({
                content: "❌ An error occurred while removing the employee from the database.",
                ephemeral: true
            });
        }
    }
};
