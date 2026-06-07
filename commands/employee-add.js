const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionsBitField
} = require("discord.js");

const db = require("../database");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("employee-add")
        .setDescription("Register a new employee")

        .addStringOption(option =>
            option
                .setName("name")
                .setDescription("Employee name")
                .setRequired(true)
        )

        .addStringOption(option =>
            option
                .setName("role")
                .setDescription("Employee role")
                .addChoices(
                    { name: "Employee", value: "Employee" },
                    { name: "Admin", value: "Admin" }
                )
                .setRequired(false)
        ),

    async execute(interaction) {

        const isDiscordAdmin =
            interaction.member.permissions.has(
                PermissionsBitField.Flags.Administrator
            );

        const callerRecord = await db.getAsync(
            "SELECT role FROM employees WHERE userId = ?",
            [interaction.user.id]
        );

        const isRegisteredAdmin =
            callerRecord && callerRecord.role === "Admin";

        if (!isDiscordAdmin && !isRegisteredAdmin) {
            return interaction.reply({
                content: "❌ Only administrators can add employees.",
                ephemeral: true
            });
        }

        const employeeName =
            interaction.options.getString("name");

        const role =
            interaction.options.getString("role") || "Employee";

        const joinedDate =
            new Date().toISOString().split("T")[0];

        try {

            const existing = await db.getAsync(
                "SELECT * FROM employees WHERE username = ?",
                [employeeName]
            );

            if (existing) {
                return interaction.reply({
                    content: `⚠️ ${employeeName} is already registered.`,
                    ephemeral: true
                });
            }

            const employeeId =
                "EMP" + Math.floor(1000 + Math.random() * 9000);

            await db.runAsync(
                `
                INSERT INTO employees
                (
                    userId,
                    username,
                    role,
                    joinedDate
                )
                VALUES (?, ?, ?, ?)
                `,
                [
                    employeeId,
                    employeeName,
                    role,
                    joinedDate
                ]
            );

            const embed = new EmbedBuilder()
                .setTitle("👤 Employee Registered")
                .setColor("#2ecc71")
                .addFields(
                    {
                        name: "Employee ID",
                        value: employeeId,
                        inline: true
                    },
                    {
                        name: "Name",
                        value: employeeName,
                        inline: true
                    },
                    {
                        name: "Role",
                        value: role,
                        inline: true
                    }
                )
                .setTimestamp();

            await interaction.reply({
                embeds: [embed]
            });

        } catch (error) {

            console.error(error);

            await interaction.reply({
                content:
                    "❌ Failed to register employee.",
                ephemeral: true
            });
        }
    }
};