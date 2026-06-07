const { startScheduler } = require("../scheduler");

module.exports = {
    name: "clientReady",
    once: true,
    execute(client) {
        console.log(`🤖 Logged in as ${client.user.tag}!`);
        startScheduler(client);
    }
};
