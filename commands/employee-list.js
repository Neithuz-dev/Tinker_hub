const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require("discord.js");
const db = require("../database");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("employee-list")
        .setDescription("List all registered employees (Admin only)"),

    async execute(interaction) {
        // 1. Authorization check
        const isDiscordAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
        const callerRecord = await db.getAsync("SELECT role FROM employees WHERE userId = ?", [interaction.user.id]);
        const isRegisteredAdmin = callerRecord && callerRecord.role === "Admin";

        if (!isDiscordAdmin && !isRegisteredAdmin) {
            return interaction.reply({
                content: "❌ Only administrators can view the employee list.",
                ephemeral: true
            });
        }

        try {
            const employees = await db.allAsync("SELECT * FROM employees ORDER BY joinedDate ASC");

            if (employees.length === 0) {
                return interaction.reply({
                    content: "ℹ️ No employees registered in the database yet.",
                    ephemeral: true
                });
            }

            const embed = new EmbedBuilder()
                .setTitle("📋 Registered Employees List")
                .setColor("#0984e3")
                .setDescription(`Total registered employees: **${employees.length}**`)
                .setTimestamp();

            let descriptionText = "";
            employees.forEach((emp, index) => {
                descriptionText += `${index + 1}. <@${emp.userId}> (${emp.username}) - **${emp.role}** \`Joined: ${emp.joinedDate}\`\n`;
            });

            embed.setDescription(embed.data.description + "\n\n" + descriptionText);

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error("Error listing employees:", error);
            await interaction.reply({
                content: "❌ An error occurred while retrieving the employee list.",
                ephemeral: true
            });
        }
    }
};
