const {
    SlashCommandBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionsBitField
} = require("discord.js");
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

// Calculates weekday count in a date range (inclusive)
function getWeekdaysInRange(fromDate, toDate) {
    let start = new Date(fromDate);
    let end = new Date(toDate);
    let count = 0;
    while (start <= end) {
        const day = start.getDay();
        if (day !== 0 && day !== 6) {
            count++;
        }
        start.setDate(start.getDate() + 1);
    }
    return count;
}

function isValidDate(dateStr) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
    const parts = dateStr.split("-");
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const date = new Date(year, month, day);
    return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day;
}

module.exports = {

    data: new SlashCommandBuilder()
        .setName("leave")
        .setDescription("Apply for leave (Name-based)")
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
        if (interaction.channelId !== "1512886631265206425") {
            return interaction.reply({
                content: "❌ This command can only be used in the <#1512886631265206425> channel.",
                ephemeral: true
            });
        }

        const employeeName = interaction.options.getString("name");
        const employeeId = interaction.options.getString("id");
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
            return interaction.reply({
                content: `❌ Employee not found. Please ensure the name or ID is correct and the employee is registered.`,
                ephemeral: true
            });
        }

        const currentMonth = new Date().toISOString().substring(0, 7);
        const taken = await getApprovedLeaveDaysInMonth(employee.userId, currentMonth);
        const remaining = 4 - taken;

        const modal = new ModalBuilder()
            .setCustomId(`leaveModal_${employee.userId}`)
            .setTitle(`Leave Application: ${employee.username}`);

        // Put the remaining balance in the label
        const leaveType = new TextInputBuilder()
            .setCustomId("leaveType")
            .setLabel(`Leave Type (Balance: ${remaining}/4 Remaining)`)
            .setPlaceholder("Sick Leave / Casual Leave")
            .setStyle(TextInputStyle.Short);

        const reason = new TextInputBuilder()
            .setCustomId("reason")
            .setLabel("Reason")
            .setPlaceholder("Describe the reason for your leave...")
            .setStyle(TextInputStyle.Paragraph);

        const fromDate = new TextInputBuilder()
            .setCustomId("fromDate")
            .setLabel("From Date")
            .setPlaceholder("YYYY-MM-DD (e.g., 2026-06-10)")
            .setStyle(TextInputStyle.Short);

        const toDate = new TextInputBuilder()
            .setCustomId("toDate")
            .setLabel("To Date")
            .setPlaceholder("YYYY-MM-DD (e.g., 2026-06-12)")
            .setStyle(TextInputStyle.Short);

        modal.addComponents(
            new ActionRowBuilder().addComponents(leaveType),
            new ActionRowBuilder().addComponents(reason),
            new ActionRowBuilder().addComponents(fromDate),
            new ActionRowBuilder().addComponents(toDate)
        );

        await interaction.showModal(modal);
    },

    async handleModal(interaction) {
        const parts = interaction.customId.split("_");
        const empId = parts[1]; // e.g. EMP1234

        // Get employee details
        const employee = await db.getAsync("SELECT * FROM employees WHERE userId = ?", [empId]);
        if (!employee) {
            return interaction.reply({
                content: "❌ Employee registration details not found. Cannot submit leave.",
                ephemeral: true
            });
        }

        const leaveType = interaction.fields.getTextInputValue("leaveType").trim();
        const reason = interaction.fields.getTextInputValue("reason").trim();
        const fromDate = interaction.fields.getTextInputValue("fromDate").trim();
        const toDate = interaction.fields.getTextInputValue("toDate").trim();

        // Validate date formats
        if (!isValidDate(fromDate) || !isValidDate(toDate)) {
            return interaction.reply({
                content: "❌ Invalid date format. Please use YYYY-MM-DD (e.g., 2026-06-10).",
                ephemeral: true
            });
        }

        // Validate date order
        const start = new Date(fromDate);
        const end = new Date(toDate);
        if (start > end) {
            return interaction.reply({
                content: "❌ From Date cannot be after To Date.",
                ephemeral: true
            });
        }

        // Target leave channel ID 1512887084376133823
        const leaveChannelId = "1512887084376133823";
        const leaveChannel = interaction.guild.channels.cache.get(leaveChannelId);

        if (!leaveChannel) {
            return interaction.reply({
                content: `❌ Could not find admin review channel (<#${leaveChannelId}>) in this server.`,
                ephemeral: true
            });
        }

        try {
            // Calculate leave balance for the month of the request start date
            const startMonth = fromDate.substring(0, 7);
            const takenBefore = await getApprovedLeaveDaysInMonth(employee.userId, startMonth);
            const requestedWeekdays = getWeekdaysInRange(fromDate, toDate);
            const remainingBefore = 4 - takenBefore;
            // If no remaining leaves, auto-reject the request
            if (remainingBefore <= 0) {
                await interaction.reply({
                    content: `❌ You have no remaining leave days for this month. Your leave request has been automatically rejected.`,
                    ephemeral: true
                });
                return;
            }
            const remainingAfter = remainingBefore - requestedWeekdays;
            // Proceed to save leave request to database
            const appliedDate = new Date().toISOString().split("T")[0];
            const result = await db.runAsync(
                `INSERT INTO leaves (userId, username, leaveType, reason, fromDate, toDate, status, appliedDate) 
                 VALUES (?, ?, ?, ?, ?, ?, 'Pending', ?)`,
                [employee.userId, employee.username, leaveType, reason, fromDate, toDate, appliedDate]
            );

            const leaveId = result.lastID;

            const embed = new EmbedBuilder()
                .setTitle("📄 Leave Request (Pending)")
                .setColor("#f1c40f")
                .addFields(
                    { name: "Request ID", value: String(leaveId), inline: true },
                    { name: "Employee", value: `**${employee.username}** (${employee.userId})`, inline: true },
                    { name: "Leave Type", value: leaveType, inline: true },
                    { name: "From Date", value: fromDate, inline: true },
                    { name: "To Date", value: toDate, inline: true },
                    { name: "Requested Weekdays", value: `${requestedWeekdays} day(s) (excl. weekends)`, inline: true },
                    { name: "Balance (Start Month)", value: `Current: **${remainingBefore}/4**\nRemaining After Approval: **${remainingAfter}/4**` },
                    { name: "Reason", value: reason }
                )
                .setTimestamp();

            const approveButton = new ButtonBuilder()
                .setCustomId(`approve_${leaveId}_${employee.userId}`)
                .setLabel("Approve")
                .setStyle(ButtonStyle.Success);

            const rejectButton = new ButtonBuilder()
                .setCustomId(`reject_${leaveId}_${employee.userId}`)
                .setLabel("Reject")
                .setStyle(ButtonStyle.Danger);

            const row = new ActionRowBuilder().addComponents(approveButton, rejectButton);

            // Fetch registered admins from database to ping them
            const admins = await db.allAsync("SELECT userId FROM employees WHERE role = 'Admin'");
            let adminPings = "";
            if (admins && admins.length > 0) {
                adminPings = admins
                    .filter(adm => /^\d{17,19}$/.test(adm.userId))
                    .map(adm => `<@${adm.userId}>`)
                    .join(" ");
            }

            const statusMsg = await leaveChannel.send({
                content: adminPings ? `🔔 Attention Admins: ${adminPings}` : null,
                embeds: [embed],
                components: [row]
            });

            // Send DM to registered admins if they have valid Discord user IDs
            if (admins && admins.length > 0) {
                for (const adm of admins) {
                    if (/^\d{17,19}$/.test(adm.userId)) {
                        try {
                            const adminUser = await interaction.client.users.fetch(adm.userId);
                            if (adminUser) {
                                await adminUser.send({
                                    content: `📄 **New Leave Request** from **${employee.username}** needs your review.\nGo to channel: <#${leaveChannelId}> (Message: ${statusMsg.url})`
                                });
                            }
                        } catch (dmErr) {
                            console.warn(`Could not send DM to admin ${adm.userId}:`, dmErr.message);
                        }
                    }
                }
            }

            await interaction.reply({
                content: `✅ Leave request for **${employee.username}** submitted successfully to <#${leaveChannelId}>.`,
                ephemeral: true
            });
        } catch (error) {
            console.error("Error submitting leave request:", error);
            await interaction.reply({
                content: "❌ An error occurred while submitting your leave request.",
                ephemeral: true
            });
        }
    },

    async handleButton(interaction) {
        // Authorization check: Must be Discord Administrator or registered Admin
        const isDiscordAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
        const callerRecord = await db.getAsync("SELECT role FROM employees WHERE userId = ?", [interaction.user.id]);
        const isRegisteredAdmin = callerRecord && callerRecord.role === "Admin";

        if (!isDiscordAdmin && !isRegisteredAdmin) {
            return interaction.reply({
                content: "❌ Only administrators can approve or reject leave requests.",
                ephemeral: true
            });
        }

        const [action, leaveId, applicantId] = interaction.customId.split("_");
        const statusText = action === "approve" ? "Approved" : "Rejected";
        const color = action === "approve" ? "#2ecc71" : "#d63031";

        try {
            // Check if leave exists and is still pending
            const leaveRecord = await db.getAsync("SELECT * FROM leaves WHERE id = ?", [leaveId]);
            if (!leaveRecord) {
                return interaction.reply({
                    content: "❌ Leave record not found in the database.",
                    ephemeral: true
                });
            }

            if (leaveRecord.status !== "Pending") {
                return interaction.reply({
                    content: `⚠️ This leave request has already been marked as **${leaveRecord.status}**.`,
                    ephemeral: true
                });
            }

            // Update database status
            await db.runAsync("UPDATE leaves SET status = ? WHERE id = ?", [statusText, leaveId]);

            // If approved, automatically populate attendance logs for the employee
            if (action === "approve") {
                let start = new Date(leaveRecord.fromDate);
                let end = new Date(leaveRecord.toDate);

                while (start <= end) {
                    const dateStr = start.toISOString().split("T")[0];
                    const day = start.getDay();

                    // Exclude weekends from marking attendance as leave
                    if (day !== 0 && day !== 6) {
                        const existing = await db.getAsync("SELECT * FROM attendance WHERE userId = ? AND date = ?", [leaveRecord.userId, dateStr]);

                        if (existing) {
                            await db.runAsync(
                                "UPDATE attendance SET status = ?, time = ? WHERE id = ?",
                                [`Leave: ${leaveRecord.leaveType}`, "09:00:00", existing.id]
                            );
                        } else {
                            await db.runAsync(
                                "INSERT INTO attendance (userId, username, date, status, time) VALUES (?, ?, ?, ?, ?)",
                                [leaveRecord.userId, leaveRecord.username, dateStr, `Leave: ${leaveRecord.leaveType}`, "09:00:00"]
                            );
                        }
                    }
                    start.setDate(start.getDate() + 1);
                }
            }

            // Update the embed in admin review channel and disable buttons
            const originalEmbed = interaction.message.embeds[0];
            const updatedEmbed = EmbedBuilder.from(originalEmbed)
                .setTitle(`📄 Leave Request - ${statusText}`)
                .setColor(color)
                .setTimestamp();

            await interaction.update({
                content: `Status: **${statusText}** by ${interaction.user.username}`,
                embeds: [updatedEmbed],
                components: []
            });

            // Post the status notification back to status channel 1512886676127482087
            const statusChannelId = "1512886676127482087";
            const statusChannel = interaction.guild.channels.cache.get(statusChannelId);
            if (statusChannel) {
                const statusEmbed = new EmbedBuilder()
                    .setTitle(`📄 Leave Request: ${statusText}`)
                    .setColor(color)
                    .setDescription(`Leave request for **${leaveRecord.username}** (${leaveRecord.userId}) has been **${statusText.toLowerCase()}** by **${interaction.user.username}**.`)
                    .addFields(
                        { name: "Leave Type", value: leaveRecord.leaveType, inline: true },
                        { name: "From Date", value: leaveRecord.fromDate, inline: true },
                        { name: "To Date", value: leaveRecord.toDate, inline: true },
                        { name: "Reason", value: leaveRecord.reason || "No reason provided" }
                    )
                    .setTimestamp();
                
                await statusChannel.send({ embeds: [statusEmbed] });
            }

            // Send DM notification to applicant if it's a valid Discord snowflake
            if (/^\d{17,19}$/.test(leaveRecord.userId)) {
                try {
                    const applicantUser = await interaction.client.users.fetch(leaveRecord.userId);
                    if (applicantUser) {
                        const dmEmbed = new EmbedBuilder()
                            .setTitle(`📄 Leave Request: ${statusText}`)
                            .setColor(color)
                            .setDescription(`Your leave request has been **${statusText.toLowerCase()}** by <@${interaction.user.id}> (${interaction.user.username}).`)
                            .addFields(
                                { name: "From Date", value: leaveRecord.fromDate, inline: true },
                                { name: "To Date", value: leaveRecord.toDate, inline: true },
                                { name: "Leave Type", value: leaveRecord.leaveType, inline: true },
                                { name: "Reason", value: leaveRecord.reason || "No reason provided" }
                            )
                            .setTimestamp();

                        await applicantUser.send({ embeds: [dmEmbed] });
                    }
                } catch (dmError) {
                    console.warn(`Could not send DM to applicant ${leaveRecord.userId}:`, dmError.message);
                }
            }
        } catch (error) {
            console.error("Error handling leave button interaction:", error);
            await interaction.reply({
                content: "❌ An error occurred while updating the leave request status.",
                ephemeral: true
            });
        }
    }
};