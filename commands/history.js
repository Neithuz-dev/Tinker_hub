const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const db = require("../database");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("history")
        .setDescription("View attendance history for an employee")
        .addStringOption(option =>
            option
                .setName("range")
                .setDescription("Time range for attendance details")
                .addChoices(
                    { name: "Past Week", value: "week" },
                    { name: "Whole Month", value: "month" }
                )
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("name")
                .setDescription("Employee name")
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName("id")
                .setDescription("Employee Discord ID")
                .setRequired(false)
        ),

    async execute(interaction) {
        // Enforce channel restriction
        if (interaction.channelId !== "1512886352344125571") {
            return interaction.reply({
                content: "❌ This command can only be used in the <#1512886352344125571> channel.",
                ephemeral: true
            });
        }

        const employeeName = interaction.options.getString("name");
        const employeeId = interaction.options.getString("id");
        const range = interaction.options.getString("range");
        try {
            // Find employee by ID or name case-insensitively
            let employee;
            if (employeeId) {
                employee = await db.getAsync("SELECT * FROM employees WHERE LOWER(userId) = LOWER(?)", [employeeId]);
            } else if (employeeName) {
                employee = await db.getAsync("SELECT * FROM employees WHERE LOWER(username) = LOWER(?)", [employeeName]);
            } else {
                return interaction.reply({
                    content: "❌ Please provide either an employee name or ID.",
                    ephemeral: true
                });
            }
            if (!employee) {
                return interaction.reply({
                    content: `❌ Employee not found. Please ensure the name or ID is correct and the employee is registered.`,
                    ephemeral: true
                });
            }

            let records = [];
            let dateRangeTitle = "";

            if (range === "week") {
                // Fetch attendance from past 7 days
                const dateLimit = new Date();
                dateLimit.setDate(dateLimit.getDate() - 7);
                const limitStr = dateLimit.toISOString().split("T")[0]; // YYYY-MM-DD
                
                records = await db.allAsync(
                    "SELECT * FROM attendance WHERE userId = ? AND date >= ? ORDER BY date DESC",
                    [employee.userId, limitStr]
                );
                dateRangeTitle = "Past Week";
            } else if (range === "month") {
                // Fetch attendance for current calendar month
                const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
                
                records = await db.allAsync(
                    "SELECT * FROM attendance WHERE userId = ? AND date LIKE ? ORDER BY date DESC",
                    [employee.userId, `${currentMonth}%`]
                );
                dateRangeTitle = "Whole Month";
            }

            if (records.length === 0) {
                return interaction.reply({
                    content: `ℹ️ No attendance history found for **${employee.username}** (${employee.userId}) in the selected period (${dateRangeTitle}).`,
                    ephemeral: true
                });
            }

            const embed = new EmbedBuilder()
                .setTitle(`📅 Attendance History: ${employee.username}`)
                .setColor("#74b9ff")
                .setDescription(`Attendance details for **${employee.username}** (${employee.userId}) for **${dateRangeTitle}**.\nTotal records found: **${records.length}**`)
                .setTimestamp();

            // Handle Discord embed field limit (25) or output size
            const maxFields = Math.min(records.length, 25);
            for (let i = 0; i < maxFields; i++) {
                const rec = records[i];
                let emoji = "✅";
                const status = rec.status.toLowerCase();
                if (status === "present") emoji = "✅";
                else if (status.includes("leave")) emoji = "🤒";
                else emoji = "❌";

                embed.addFields({
                    name: `${emoji} ${rec.date}`,
                    value: `Status: **${rec.status}**\nLogged Time: \`${rec.time}\``,
                    inline: true
                });
            }

            if (records.length > 25) {
                embed.setFooter({ text: `Showing first 25 logs of ${records.length}.` });
            }

            await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (error) {
            console.error("Error retrieving attendance history:", error);
            await interaction.reply({
                content: "❌ An error occurred while retrieving attendance history.",
                ephemeral: true
            });
        }
    }
};
