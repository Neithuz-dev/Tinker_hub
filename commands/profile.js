const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const db = require("../database");

function getProgressBar(rate) {
    const totalBars = 10;
    const filledBars = Math.min(10, Math.max(0, Math.round(rate / 10)));
    const emptyBars = totalBars - filledBars;
    return "🟩".repeat(filledBars) + "⬛".repeat(emptyBars) + ` **${rate.toFixed(1)}%**`;
}

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

module.exports = {
    data: new SlashCommandBuilder()
        .setName("profile")
        .setDescription("View attendance profile and statistics")
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
        const employeeName = interaction.options.getString("name");
        const employeeId = interaction.options.getString("id");
        let employee;
        if (employeeId) {
            employee = await db.getAsync("SELECT * FROM employees WHERE LOWER(userId) = LOWER(?)", [employeeId]);
        } else if (employeeName) {
            employee = await db.getAsync("SELECT * FROM employees WHERE LOWER(username) = LOWER(?)", [employeeName]);
        } else {
            employee = await db.getAsync("SELECT * FROM employees WHERE userId = ?", [interaction.user.id]);
        }

        if (!employee) {
            return interaction.reply({
                content: "❌ Employee registration details not found.",
                ephemeral: true
            });
        }

        try {
            const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
            const currentMonthName = new Date().toLocaleString("default", { month: "long", year: "numeric" });

            // Fetch leave stats for the current month
            const leavesTaken = await getApprovedLeaveDaysInMonth(employee.userId, currentMonth);
            const leavesRemaining = 4 - leavesTaken;

            // Fetch approved leaves (limit to last 10)
            const approvedLeaves = await db.allAsync(
                "SELECT fromDate, toDate, leaveType, reason FROM leaves WHERE userId = ? AND status = 'Approved' ORDER BY fromDate DESC LIMIT 10",
                [employee.userId]
            );

            let leaveHistoryText = "";
            if (approvedLeaves.length > 0) {
                approvedLeaves.forEach(leave => {
                    const reasonText = leave.reason ? ` - *"${leave.reason}"*` : "";
                    leaveHistoryText += `• **${leave.fromDate}** to **${leave.toDate}** (${leave.leaveType})${reasonText}\n`;
                });
            } else {
                leaveHistoryText = "*No approved leaves logged.*";
            }

            // Fetch all attendance logs for this user
            const records = await db.allAsync("SELECT status FROM attendance WHERE userId = ?", [employee.userId]);

            let presentCount = 0;
            let wfhCount = 0;
            let sickCount = 0;
            let casualCount = 0;
            let otherLeaveCount = 0;

            records.forEach(rec => {
                const status = rec.status.toLowerCase();
                if (status === "present") {
                    presentCount++;
                } else if (status === "work from home" || status === "wfh") {
                    wfhCount++;
                } else if (status.includes("sick")) {
                    sickCount++;
                } else if (status.includes("casual")) {
                    casualCount++;
                } else if (status.includes("leave")) {
                    otherLeaveCount++;
                } else {
                    presentCount++;
                }
            });

            const totalLeaves = sickCount + casualCount + otherLeaveCount;
            const totalLogged = presentCount + wfhCount + totalLeaves;

            // Attendance Rate is calculated as (Present + WFH) / Total Logged days
            const attendanceRate = totalLogged > 0 ? ((presentCount + wfhCount) / totalLogged) * 100 : 100;

            let avatarUrl = interaction.user.displayAvatarURL();
            if (/^\d{17,19}$/.test(employee.userId)) {
                try {
                    const fetchedUser = await interaction.client.users.fetch(employee.userId);
                    if (fetchedUser) {
                        avatarUrl = fetchedUser.displayAvatarURL();
                    }
                } catch (e) {
                    // Ignore
                }
            }

            const embed = new EmbedBuilder()
                .setTitle(`👤 Employee Profile: ${employee.username}`)
                .setColor("#6c5ce7")
                .setThumbnail(avatarUrl)
                .setDescription(`Work profile, leave balances, and attendance metrics.`)
                .addFields(
                    { name: "User", value: `<@${employee.userId}>`, inline: true },
                    { name: "Role", value: employee.role, inline: true },
                    { name: "Joined Date", value: employee.joinedDate, inline: true },
                    { name: "Attendance Rate", value: getProgressBar(attendanceRate) },
                    { name: `📅 Leave Balance (${currentMonthName})`, value: `Leaves Taken: **${leavesTaken} / 4**\nRemaining Balance: **${leavesRemaining}**` },
                    { name: "📅 Approved Leaves List (Recent)", value: leaveHistoryText },
                    { name: "✅ Present Days", value: String(presentCount), inline: true },
                    { name: "🏠 WFH Days", value: String(wfhCount), inline: true },
                    { name: "🤒 Sick Leaves", value: String(sickCount), inline: true },
                    { name: "🏖️ Casual Leaves", value: String(casualCount), inline: true },
                    { name: "📄 Other Leaves", value: String(otherLeaveCount), inline: true },
                    { name: "📊 Total Days Logged", value: String(totalLogged), inline: true }
                )
                .setFooter({ text: "HR Management Bot" })
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (error) {
            console.error("Error retrieving profile details:", error);
            await interaction.reply({
                content: "❌ An error occurred while retrieving your profile statistics.",
                ephemeral: true
            });
        }
    }
};
