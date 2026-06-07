const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder
} = require("discord.js");

const db = require("../database");

module.exports = {

    data: new SlashCommandBuilder()
        .setName("attendance")
        .setDescription("Mark today's attendance (by name or ID)")
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
        if (interaction.channelId !== "1512876668568473601") {
            return interaction.reply({
                content: "❌ This command can only be used in the <#1512876668568473601> channel.",
                ephemeral: true
            });
        }

        await interaction.deferReply({ flags: 64 });

        let employeeName = interaction.options.getString("name");
        let employeeId = interaction.options.getString("id");
        let employee;
        if (employeeId) {
            // Lookup by provided Discord ID (case-insensitive)
            employee = await db.getAsync("SELECT * FROM employees WHERE LOWER(userId) = LOWER(?)", [employeeId]);
        } else if (employeeName) {
            // Lookup by provided name (case-insensitive)
            employee = await db.getAsync("SELECT * FROM employees WHERE LOWER(username) = LOWER(?)", [employeeName]);
        } else {
            // Fallback to command invoker's Discord ID
            employee = await db.getAsync("SELECT * FROM employees WHERE userId = ?", [interaction.user.id]);
        }
        if (!employee) {
            return interaction.editReply({
                content: `❌ Employee not found. Please ensure you are registered using \`/employee-add\`.`
            });
        }

        const embed = new EmbedBuilder()
            .setTitle(`📅 Daily Attendance: ${employee.username}`)
            .setColor("#00cec9")
            .setDescription(`Select the attendance status for **${employee.username}** (ID: ${employee.userId}) today.`);

        // Two buttons: Present and Absent
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`present_${employee.userId}`)
                    .setLabel("Present")
                    .setEmoji("✅")
                    .setStyle(ButtonStyle.Success),

                new ButtonBuilder()
                    .setCustomId(`absent_${employee.userId}`)
                    .setLabel("Absent")
                    .setEmoji("❌")
                    .setStyle(ButtonStyle.Danger)
            );

        await interaction.editReply({
            embeds: [embed],
            components: [row]
        });
    },

    async handleButton(interaction) {
        const parts = interaction.customId.split("_");
        const buttonAction = parts[0]; // present or absent
        const empId = parts[1]; // e.g., EMP1234

        // Enforce employee registration check
        const employee = await db.getAsync("SELECT * FROM employees WHERE userId = ?", [empId]);
        if (!employee) {
            return interaction.reply({
                content: "❌ Employee registration details not found. Cannot mark attendance.",
                ephemeral: true
            });
        }

        const statuses = {
            present: "Present",
            absent: "Absent"
        };

        const status = statuses[buttonAction];
        if (!status) return;

        const date = new Date().toISOString().split("T")[0];
        const time = new Date().toLocaleTimeString();

        try {
            // Check if attendance already marked for today
            const existing = await db.getAsync(
                "SELECT * FROM attendance WHERE userId = ? AND date = ?",
                [employee.userId, date]
            );

            if (existing) {
                // Update existing attendance
                await db.runAsync(
                    "UPDATE attendance SET status = ?, time = ? WHERE id = ?",
                    [status, time, existing.id]
                );

                await interaction.reply({
                    content: `🔄 Attendance Updated\n\nEmployee: **${employee.username}** (${employee.userId})\nNew Status: **${status}**\nTime: ${time}`,
                    ephemeral: true
                });
            } else {
                // Insert new attendance
                await db.runAsync(
                    "INSERT INTO attendance (userId, username, date, status, time) VALUES (?, ?, ?, ?, ?)",
                    [
                        employee.userId,
                        employee.username,
                        date,
                        status,
                        time
                    ]
                );

                await interaction.reply({
                    content: `✅ Attendance Marked\n\nEmployee: **${employee.username}** (${employee.userId})\nStatus: **${status}**\nTime: ${time}`,
                    ephemeral: true
                });
            }
        } catch (error) {
            console.error("Error marking attendance:", error);
            await interaction.reply({
                content: "❌ An error occurred while saving the attendance.",
                ephemeral: true
            });
        }
    }
};