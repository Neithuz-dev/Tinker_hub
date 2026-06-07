const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField, AttachmentBuilder } = require("discord.js");
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

async function generateReportData(guild, month) {
    // Fetch registered employees
    const employees = await db.allAsync("SELECT * FROM employees ORDER BY username ASC");
    if (employees.length === 0) {
        return null;
    }

    // Fetch attendance logs for that month
    const logs = await db.allAsync(
        "SELECT * FROM attendance WHERE date LIKE ? ORDER BY date ASC",
        [`${month}%`]
    );

    // Generate CSV content
    let csvContent = "Employee Username,Employee ID,Date,Status,Log Time\n";
    logs.forEach(log => {
        const escapedUsername = log.username.replace(/"/g, '""');
        const escapedStatus = log.status.replace(/"/g, '""');
        csvContent += `"${escapedUsername}","${log.userId}","${log.date}","${escapedStatus}","${log.time}"\n`;
    });

    // Append a team leave balance summary block at the bottom of the CSV
    csvContent += "\n--- Month Summaries ---\n";
    csvContent += "Employee Username,Employee ID,Leaves Taken,Leaves Remaining\n";

    // Generate Embed summary and populate CSV summaries
    let summaryListText = "";
    for (let i = 0; i < employees.length; i++) {
        const emp = employees[i];
        const empLogs = logs.filter(l => l.userId === emp.userId);
        const present = empLogs.filter(l => l.status.toLowerCase() === "present").length;
        const wfh = empLogs.filter(l => l.status.toLowerCase() === "work from home" || l.status.toLowerCase() === "wfh").length;

        // Calculate leaves taken and remaining in the targeted month
        const leavesTaken = await getApprovedLeaveDaysInMonth(emp.userId, month);
        const leavesRemaining = 4 - leavesTaken;

        summaryListText += `• **${emp.username}**: \`${present} Pres | ${wfh} WFH | ${leavesTaken} Lve\` | Leaves: **${leavesRemaining}/4** Rem.\n`;

        const escapedUsername = emp.username.replace(/"/g, '""');
        csvContent += `"${escapedUsername}","${emp.userId}",${leavesTaken},${leavesRemaining}\n`;
    }

    const csvBuffer = Buffer.from(csvContent, "utf-8");
    const attachment = new AttachmentBuilder(csvBuffer, { name: `attendance_report_${month}.csv` });

    const embed = new EmbedBuilder()
        .setTitle(`📅 Attendance Report: ${month}`)
        .setColor("#00b894")
        .setDescription(`Monthly attendance summaries and CSV download.`)
        .addFields(
            { name: "Month", value: month, inline: true },
            { name: "Total Logs", value: String(logs.length), inline: true },
            { name: "Registered Employees", value: String(employees.length), inline: true }
        )
        .setTimestamp();

    if (summaryListText.length > 2048) {
        embed.addFields({ name: "Employee Summaries", value: summaryListText.substring(0, 1021) + "..." });
    } else {
        embed.setDescription(embed.data.description + "\n\n" + summaryListText);
    }

    return { embeds: [embed], files: [attachment] };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("report")
        .setDescription("Generate a monthly attendance report (Admin only)")
        .addStringOption(option =>
            option
                .setName("month")
                .setDescription("Target month in YYYY-MM format (default: current month)")
                .setRequired(false)
        ),

    async execute(interaction) {
        // 1. Authorization check
        const isDiscordAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
        const callerRecord = await db.getAsync("SELECT role FROM employees WHERE userId = ?", [interaction.user.id]);
        const isRegisteredAdmin = callerRecord && callerRecord.role === "Admin";

        if (!isDiscordAdmin && !isRegisteredAdmin) {
            return interaction.reply({
                content: "❌ Only administrators can generate attendance reports.",
                ephemeral: true
            });
        }

        const month = interaction.options.getString("month") || new Date().toISOString().substring(0, 7);

        // Validate format YYYY-MM
        if (!/^\d{4}-\d{2}$/.test(month)) {
            return interaction.reply({
                content: "❌ Invalid month format. Please use YYYY-MM (e.g., 2026-06).",
                ephemeral: true
            });
        }

        try {
            const reportData = await generateReportData(interaction.guild, month);
            if (!reportData) {
                return interaction.reply({
                    content: "⚠️ No employees registered in the database.",
                    ephemeral: true
                });
            }

            // Add generator detail to the embed
            if (reportData.embeds && reportData.embeds[0]) {
                reportData.embeds[0].setFooter({
                    text: `Generated by ${interaction.user.username}`,
                    iconURL: interaction.user.displayAvatarURL()
                });
            }

            // Find #monthly-reports channel
            const reportChannel = interaction.guild.channels.cache.find(
                channel => channel.name === "monthly-reports"
            );

            if (reportChannel) {
                await reportChannel.send(reportData);
                await interaction.reply({
                    content: `✅ Report successfully generated and posted in <#${reportChannel.id}>.`,
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    content: "ℹ️ Channel `#monthly-reports` not found. Sending report directly here.",
                    embeds: reportData.embeds,
                    files: reportData.files
                });
            }
        } catch (error) {
            console.error("Error generating report:", error);
            await interaction.reply({
                content: "❌ An error occurred while generating the attendance report.",
                ephemeral: true
            });
        }
    },

    generateReportData
};
