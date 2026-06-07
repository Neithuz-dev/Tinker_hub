const db = require("./database");
const { generateDashboardEmbed } = require("./commands/dashboard");
const { generateReportData } = require("./commands/report");

let lastDailyRunDate = "";
let lastMonthlyRunMonth = "";

async function startScheduler(client) {
    console.log("⏰ Attendance automated report scheduler started.");

    // Load last run states from DB
    try {
        const dailyRecord = await db.getAsync("SELECT value FROM scheduler_state WHERE key = 'last_daily_run'");
        const monthlyRecord = await db.getAsync("SELECT value FROM scheduler_state WHERE key = 'last_monthly_run'");
        if (dailyRecord) lastDailyRunDate = dailyRecord.value;
        if (monthlyRecord) lastMonthlyRunMonth = monthlyRecord.value;
        console.log(`Loaded scheduler state - Last Daily: ${lastDailyRunDate || 'None'}, Last Monthly: ${lastMonthlyRunMonth || 'None'}`);
    } catch (e) {
        console.error("Failed to load scheduler state:", e);
    }

    setInterval(async () => {
        const now = new Date();
        const hour = now.getHours();

        // Target run time: 18:00 (6:00 PM)
        if (hour !== 18) return;

        const todayStr = now.toISOString().split("T")[0]; // YYYY-MM-DD
        const monthStr = todayStr.substring(0, 7); // YYYY-MM

        // 1. Run Daily Report
        if (lastDailyRunDate !== todayStr) {
            lastDailyRunDate = todayStr;
            try {
                await db.runAsync(
                    "INSERT INTO scheduler_state (key, value) VALUES ('last_daily_run', ?) ON CONFLICT(key) DO UPDATE SET value = ?",
                    [todayStr, todayStr]
                );
            } catch (dbErr) {
                console.error("Failed to save daily scheduler run date to DB:", dbErr);
            }
            console.log(`⏰ Running automated daily attendance report for ${todayStr}...`);

            for (const [guildId, guild] of client.guilds.cache) {
                try {
                    const dashboardChannel = guild.channels.cache.get("1513128762903105599") || guild.channels.cache.find(
                        c => c.name === "attendance-dashboard" || c.name === "daily-reports" || c.name === "admin-reports"
                    );

                    if (dashboardChannel) {
                        const dashboardData = await generateDashboardEmbed(guild, todayStr);
                        if (dashboardData && dashboardData.embeds && dashboardData.embeds[0]) {
                            dashboardData.embeds[0].setFooter({ text: "Auto-generated Daily Report" });
                            await dashboardChannel.send(dashboardData);
                            console.log(`✅ Posted daily report in ${guild.name} (#${dashboardChannel.name})`);
                        }
                    } else {
                        console.log(`⚠️ No daily report channel found in guild: ${guild.name}`);
                    }
                } catch (err) {
                    console.error(`Error running daily report in guild ${guildId}:`, err);
                }
            }
        }

        // 2. Run Monthly Report (on the last day of the month)
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);
        const isLastDayOfMonth = tomorrow.getMonth() !== now.getMonth();

        if (isLastDayOfMonth && lastMonthlyRunMonth !== monthStr) {
            lastMonthlyRunMonth = monthStr;
            try {
                await db.runAsync(
                    "INSERT INTO scheduler_state (key, value) VALUES ('last_monthly_run', ?) ON CONFLICT(key) DO UPDATE SET value = ?",
                    [monthStr, monthStr]
                );
            } catch (dbErr) {
                console.error("Failed to save monthly scheduler run date to DB:", dbErr);
            }
            console.log(`⏰ Running automated monthly attendance report for ${monthStr}...`);

            for (const [guildId, guild] of client.guilds.cache) {
                try {
                    const reportChannel = guild.channels.cache.get("1512886896945266828") || guild.channels.cache.find(
                        c => c.name === "monthly-reports" || c.name === "admin-reports"
                    );

                    if (reportChannel) {
                        const reportData = await generateReportData(guild, monthStr);
                        if (reportData && reportData.embeds && reportData.embeds[0]) {
                            reportData.embeds[0].setFooter({ text: "Auto-generated Monthly Report" });
                            await reportChannel.send(reportData);
                            console.log(`✅ Posted monthly report in ${guild.name} (#${reportChannel.name})`);
                        }
                    } else {
                        console.log(`⚠️ No monthly report channel found in guild: ${guild.name}`);
                    }
                } catch (err) {
                    console.error(`Error running monthly report in guild ${guildId}:`, err);
                }
            }
        }

    }, 60000); // Check every minute
}

module.exports = { startScheduler };
