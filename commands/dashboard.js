const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require("discord.js");
const db = require("../database");

// Calculates approved weekday leave days for a user in a target month (YYYY-MM)
async function getApprovedLeaveDaysInMonth(userId, monthStr) {
    const approved = await db.allAsync(
        "SELECT fromDate, toDate FROM leaves WHERE userId = ? AND status = 'Approved'",
        [userId]
    );

    let count = 0;
    approved.forEach(leave => {
        let start = new Date(leave.fromDate);
        let end = new Date(leave.toDate);
        while (start <= end) {
            const dateStr = start.toISOString().split("T")[0];
            if (dateStr.startsWith(monthStr)) {
                const day = start.getDay();
                if (day !== 0 && day !== 6) { // Exclude Saturday (6) and Sunday (0)
                    count++;
                }
            }
            start.setDate(start.getDate() + 1);
        }
    });
    return count;
}

async function generateDashboardEmbed(guild, today) {
    // Fetch all registered employees
    const employees = await db.allAsync("SELECT * FROM employees ORDER BY username ASC");
    if (employees.length === 0) {
        return { content: "ℹ️ No registered employees found in the database. Add some first using `/employee-add`." };
    }

    const currentMonth = today.substring(0, 7); // YYYY-MM

    // Fetch today's attendance logs
    const todayLogs = await db.allAsync("SELECT * FROM attendance WHERE date = ?", [today]);
    const logMap = new Map();
    todayLogs.forEach(log => {
        logMap.set(log.userId, log);
    });

    // Automatically fill in missing employees as Absent or On Leave, and update existing absent records if leave approved
    for (const emp of employees) {
        // Check approved leave for the target date
        const leaves = await db.allAsync(
            "SELECT * FROM leaves WHERE userId = ? AND status = 'Approved'",
            [emp.userId]
        );
        let isOnLeave = false;
        let leaveType = "";
        for (const leave of leaves) {
            if (leave.fromDate <= today && today <= leave.toDate) {
                isOnLeave = true;
                leaveType = leave.leaveType;
                break;
            }
        }

        const existingLog = logMap.get(emp.userId);
        if (!existingLog) {
            const status = isOnLeave ? `Leave: ${leaveType}` : "Absent";
            const time = isOnLeave ? "09:00:00" : "18:00:00";
            await db.runAsync(
                "INSERT INTO attendance (userId, username, date, status, time) VALUES (?, ?, ?, ?, ?)",
                [emp.userId, emp.username, today, status, time]
            );
            logMap.set(emp.userId, {
                userId: emp.userId,
                username: emp.username,
                date: today,
                status,
                time
            });
        } else if (isOnLeave && existingLog.status.toLowerCase() === "absent") {
            // Update existing absent record to leave status
            await db.runAsync(
                "UPDATE attendance SET status = ?, time = ? WHERE id = ?",
                [`Leave: ${leaveType}`, "09:00:00", existingLog.id]
            );
            existingLog.status = `Leave: ${leaveType}`;
            existingLog.time = "09:00:00";
            logMap.set(emp.userId, existingLog);
        }
    }

    let presentCount = 0;
    let leaveCount = 0;
    let absentCount = 0;

    let statusListText = "";

    for (let i = 0; i < employees.length; i++) {
        const emp = employees[i];
        const log = logMap.get(emp.userId);
        let emoji = "❌";
        let statusText = "Absent";
        let timeText = "";

        if (log) {
            const status = log.status.toLowerCase();
            if (status === "present") {
                presentCount++;
                emoji = "✅";
                statusText = "Present";
                timeText = ` at \`${log.time}\``;
            } else if (status.includes("leave")) {
                leaveCount++;
                emoji = "🤒";
                statusText = log.status;
                timeText = ` at \`${log.time}\``;
            } else {
                absentCount++;
                emoji = "❌";
                statusText = "Absent";
            }
        } else {
            absentCount++;
        }

        // Fetch leave stats for current month
        const leavesTaken = await getApprovedLeaveDaysInMonth(emp.userId, currentMonth);
        const leavesRemaining = 4 - leavesTaken;

        statusListText += `${i + 1}. **${emp.username}** (${emp.userId}) - ${emoji} **${statusText}**${timeText} | Leaves: **${leavesRemaining}/4** Remaining\n`;
    }

    const embed = new EmbedBuilder()
        .setTitle(`📊 Attendance Dashboard: ${today}`)
        .setColor("#fdcb6e")
        .setDescription(`Live summary of today's employee presence.`)
        .addFields(
            { name: "👥 Total Employees", value: String(employees.length), inline: true },
            { name: "✅ Present", value: String(presentCount), inline: true },
            { name: "🤒 On Leave", value: String(leaveCount), inline: true },
            { name: "❌ Absent", value: String(absentCount), inline: true }
        )
        .setTimestamp();

    // Handle description lengths
    if (statusListText.length > 2048) {
        embed.addFields({ name: "Employee Status List", value: statusListText.substring(0, 1021) + "..." });
    } else {
        embed.setDescription(embed.data.description + "\n\n" + statusListText);
    }

    return { embeds: [embed] };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("dashboard")
        .setDescription("View attendance dashboard for today or a specific date (Admin only)")
        .addStringOption(option =>
            option
                .setName("date")
                .setDescription("Target date in YYYY-MM-DD format (default: today)")
                .setRequired(false)
        ),

    async execute(interaction) {
        // Enforce channel restriction for admin dashboard
        if (interaction.channelId !== "1512887084376133823") {
            return interaction.reply({
                content: "❌ This command can only be used in <#1512887084376133823> channel.",
                ephemeral: true
            });
        }
        
        // Authorization check
        const isDiscordAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
        const callerRecord = await db.getAsync("SELECT role FROM employees WHERE userId = ?", [interaction.user.id]);
        const isRegisteredAdmin = callerRecord && callerRecord.role === "Admin";
        if (!isDiscordAdmin && !isRegisteredAdmin) {
            return interaction.reply({
                content: "❌ Only administrators can view the attendance dashboard.",
                ephemeral: true
            });
        }

        const dateInput = interaction.options.getString("date");
        const today = dateInput || new Date().toISOString().split("T")[0];

        // Validate format YYYY-MM-DD
        if (dateInput && !/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
            return interaction.reply({
                content: "❌ Invalid date format. Please use YYYY-MM-DD (e.g., 2026-06-07).",
                ephemeral: true
            });
        }

        try {
            const result = await generateDashboardEmbed(interaction.guild, today);

            // Add generator detail to the embed
            if (result.embeds && result.embeds[0]) {
                result.embeds[0].setFooter({
                    text: `Generated by ${interaction.user.username}`,
                    iconURL: interaction.user.displayAvatarURL()
                });
            }

            await interaction.reply(result);
        } catch (error) {
            console.error("Error generating dashboard:", error);
            await interaction.reply({
                content: "❌ An error occurred while generating the dashboard.",
                ephemeral: true
            });
        }
    },

    generateDashboardEmbed,
    getApprovedLeaveDaysInMonth
};
