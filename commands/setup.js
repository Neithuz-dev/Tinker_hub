const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require("discord.js");
const db = require("../database");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("setup")
        .setDescription("Initialize information and guides in target channels (Admin only)"),

    async execute(interaction) {
        // 1. Authorization check
        const isDiscordAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
        const callerRecord = await db.getAsync("SELECT role FROM employees WHERE userId = ?", [interaction.user.id]);
        const isRegisteredAdmin = callerRecord && callerRecord.role === "Admin";

        if (!isDiscordAdmin && !isRegisteredAdmin) {
            return interaction.reply({
                content: "❌ Only administrators can run the setup command.",
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            // Fetch registered Admins
            const admins = await db.allAsync("SELECT * FROM employees WHERE role = 'Admin'");
            let adminListText = "";
            if (admins.length > 0) {
                admins.forEach((adm, idx) => {
                    adminListText += `• <@${adm.userId}> (${adm.username})\n`;
                });
            } else {
                adminListText = `• <@${interaction.user.id}> (Default Admin)\n`;
            }

            // Target Channels
            const generalInfoChannel = interaction.guild.channels.cache.find(c => c.name === "general-information");
            const markAttendanceChannel = interaction.guild.channels.cache.find(c => c.name === "mark-attendance");
            const applyLeaveChannel = interaction.guild.channels.cache.find(c => c.name === "apply-leave");

            let logMessage = "Setup complete:\n";

            // 1. General Information Channel
            if (generalInfoChannel) {
                const infoEmbed = new EmbedBuilder()
                    .setTitle("ℹ️ Attendance & Leave Bot Information")
                    .setColor("#34495e")
                    .setDescription("Welcome to the server! Below is the guide on how to interact with the HR Bot.")
                    .addFields(
                        {
                            name: "👤 Employee Commands",
                            value: "• `/attendance` - Mark today's presence status (Present, WFH, Sick, Casual).\n" +
                                   "• `/leave` - Open the modal to apply for leave.\n" +
                                   "• `/profile` - View your attendance rate and current month's remaining leave balance.\n" +
                                   "• `/history` - View your recent attendance logs."
                        },
                        {
                            name: "🔑 Admin Commands",
                            value: "• `/employee-add` - Register a new employee.\n" +
                                   "• `/employee-remove` - Deregister an employee.\n" +
                                   "• `/employee-list` - List all registered employees.\n" +
                                   "• `/dashboard` - Display today's real-time attendance dashboard.\n" +
                                   "• `/report` - Compile monthly CSV and summary reports."
                        },
                        {
                            name: "👑 Administrator Details",
                            value: adminListText
                        }
                    )
                    .setTimestamp();

                await generalInfoChannel.send({ embeds: [infoEmbed] });
                logMessage += `✅ Posted info guide in <#${generalInfoChannel.id}>\n`;
            } else {
                logMessage += `⚠️ Channel \`general-information\` not found.\n`;
            }

            // 2. Mark Attendance Channel
            if (markAttendanceChannel) {
                const attendEmbed = new EmbedBuilder()
                    .setTitle("📅 How to Mark Daily Attendance")
                    .setColor("#1abc9c")
                    .setDescription("Log your presence status every working day to keep your attendance rate high!")
                    .addFields(
                        {
                            name: "📝 Instructions",
                            value: "1. Type `/attendance` in any channel or here and hit Enter.\n" +
                                   "2. Select your status from the buttons: **Present** ✅, **WFH** 🏠, **Sick Leave** 🤒, or **Casual Leave** 🏖️.\n" +
                                   "3. You can change your choice during the day by running `/attendance` again."
                        }
                    )
                    .setTimestamp();

                await markAttendanceChannel.send({ embeds: [attendEmbed] });
                logMessage += `✅ Posted attendance guide in <#${markAttendanceChannel.id}>\n`;
            } else {
                logMessage += `⚠️ Channel \`mark-attendance\` not found.\n`;
            }

            // 3. Apply Leave Channel
            if (applyLeaveChannel) {
                const leaveEmbed = new EmbedBuilder()
                    .setTitle("📄 How to Apply for Leaves")
                    .setColor("#e67e22")
                    .setDescription("Apply for time off and track your balances automatically.")
                    .addFields(
                        {
                            name: "ℹ️ Leave Rules",
                            value: "• Every employee receives **4 leaves per calendar month**.\n" +
                                   "• Saturdays and Sundays **do not count** against your 4-leave balance.\n" +
                                   "• Unused leaves **do not roll over** to the next month."
                        },
                        {
                            name: "📝 Application steps",
                            value: "1. Type `/leave` in any channel or here and hit Enter.\n" +
                                   "2. Fill in the modal fields: Leave Type, Reason, From Date, and To Date (format: `YYYY-MM-DD`).\n" +
                                   "3. Once submitted, your request is sent to the HR team. On approval, your attendance logs for those dates (excluding weekends) will automatically be filled."
                        }
                    )
                    .setTimestamp();

                await applyLeaveChannel.send({ embeds: [leaveEmbed] });
                logMessage += `✅ Posted leave guide in <#${applyLeaveChannel.id}>\n`;
            } else {
                logMessage += `⚠️ Channel \`apply-leave\` not found.\n`;
            }

            await interaction.editReply({ content: logMessage });
        } catch (error) {
            console.error("Error running setup:", error);
            await interaction.editReply({ content: "❌ An error occurred during setup." });
        }
    }
};
