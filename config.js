// =================================================================================
// FILE: config.js
// DESCRIPTION: Central configuration file for the Limbus Company Draft System.
//              Contains shared constants for both the server and client.
// =================================================================================

const config = {
    // Game Rules
    ROSTER_SIZE: 42,
    EGO_BAN_COUNT: 5,

    // Draft Timers (in seconds)
    TIMERS: {
        roster: 90,
        egoBan: 75, // Time for the entire EGO ban phase for one player
        pick: 15,   // Time per pick/ban action in the ID phases
    },

    // Server Configuration
    PORT: process.env.PORT || 8080,
    LOBBY_PERSISTENCE_FILE: './lobbies.json',
    LOBBY_CLEANUP_INTERVAL: 60 * 60 * 1000, // 1 hour
    LOBBY_MAX_INACTIVE_TIME: 24 * 60 * 60 * 1000, // 24 hours
};

// Using module.exports for compatibility with Node.js require()
module.exports = config;
