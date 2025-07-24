// =================================================================================
// FILE: lobbyManager.js
// DESCRIPTION: Manages the lifecycle of all draft lobbies. Handles creation,
//              retrieval, updates, and persistence of lobby data to a JSON file.
// =================================================================================
const fs = require('fs');
const crypto = require('crypto');
const config = require('./config');

// In-memory cache for lobbies
let lobbies = {};

// --- UTILITY FUNCTIONS ---

function generateUniqueLobbyCode() {
    let code;
    do {
        code = Math.random().toString(36).substring(2, 8).toUpperCase();
    } while (lobbies[code]);
    return code;
}

function persistLobbiesToDisk() {
    try {
        fs.writeFileSync(config.LOBBY_PERSISTENCE_FILE, JSON.stringify(lobbies, null, 2));
        console.log('Lobbies successfully persisted to disk.');
    } catch (error) {
        console.error('Error saving lobbies to disk:', error);
    }
}

function updateLobbyActivity(lobbyCode) {
    if (lobbies[lobbyCode]) {
        lobbies[lobbyCode].lastActivity = new Date().toISOString();
    }
}

// --- CORE LOBBY MANAGEMENT ---

function createNewLobby(options = {}) {
    const { draftLogic = '1-2-2', timerEnabled = false, isPublic = false, name = 'Referee', matchType = 'section1' } = options;
    const lobbyCode = generateUniqueLobbyCode();
    
    const newLobbyState = {
        code: lobbyCode,
        hostName: name,
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        participants: {
            p1: { name: "Player 1", status: "disconnected", ready: false, rejoinToken: null },
            p2: { name: "Player 2", status: "disconnected", ready: false, rejoinToken: null },
            ref: { name: name, status: "disconnected", rejoinToken: null }
        },
        roster: { p1: [], p2: [] },
        draft: {
            phase: "roster",
            step: 0,
            currentPlayer: "",
            action: "",
            actionCount: 0,
            available: { p1: [], p2: [] },
            idBans: { p1: [], p2: [] },
            egoBans: { p1: [], p2: [] },
            picks: { p1: [], p2: [] },
            picks_s2: { p1: [], p2: [] },
            hovered: { p1: null, p2: null },
            draftLogic,
            matchType,
            isPublic,
            coinFlipWinner: null,
            playerOrder: ['p1', 'p2'],
            timer: {
                enabled: timerEnabled,
                running: false,
                paused: false,
                endTime: 0,
                pauseTime: 0,
            }
        }
    };

    lobbies[lobbyCode] = newLobbyState;
    persistLobbiesToDisk();
    return newLobbyState;
}

function joinLobby(lobbyCode, role, name) {
    const lobby = lobbies[lobbyCode];
    if (!lobby) {
        return { error: 'Lobby not found.' };
    }
    
    const participant = lobby.participants[role];
    if (!participant) {
        return { error: 'Invalid role specified.' };
    }
    if (participant.status === 'connected' || participant.rejoinToken) {
        return { error: `Role ${role.toUpperCase()} is taken or reserved.` };
    }

    const rejoinToken = crypto.randomUUID();
    participant.status = 'connected';
    participant.rejoinToken = rejoinToken;
    if (name) {
        participant.name = name;
    }

    updateLobbyActivity(lobbyCode);
    persistLobbiesToDisk();

    return { lobby, rejoinToken };
}

function rejoinLobby(lobbyCode, role, rejoinToken) {
    const lobby = lobbies[lobbyCode];
    if (!lobby) {
        return { error: 'Lobby not found for rejoin.' };
    }
    const participant = lobby.participants[role];
    if (!participant || participant.rejoinToken !== rejoinToken) {
        return { error: 'Invalid rejoin token or role.' };
    }

    participant.status = 'connected';
    updateLobbyActivity(lobbyCode);
    persistLobbiesToDisk();

    return { lobby };
}

function handleDisconnect(ws, wss) {
    const { lobbyCode, userRole } = ws;
    if (lobbyCode && userRole && lobbies[lobbyCode]) {
        const lobby = lobbies[lobbyCode];
        const participant = lobby.participants[userRole];
        if (participant) {
            participant.status = 'disconnected';
            // Do not clear ready status, allows for rejoin
            updateLobbyActivity(lobbyCode);
            persistLobbiesToDisk();
            broadcastState(lobbyCode, wss);
        }
    }
}

function getLobby(lobbyCode) {
    return lobbies[lobbyCode];
}

function getPublicLobbies() {
    const validPhases = ['roster', 'coinFlip', 'egoBan', 'ban', 'pick', 'midBan', 'pick2', 'pick_s2'];
    return Object.values(lobbies)
        .filter(lobby => lobby.draft.isPublic && validPhases.includes(lobby.draft.phase))
        .map(lobby => ({
            code: lobby.code,
            hostName: lobby.hostName,
            participants: lobby.participants,
            draftLogic: lobby.draft.draftLogic,
        }))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 50);
}


function broadcastState(lobbyCode, wss) {
    const lobby = lobbies[lobbyCode];
    if (!lobby) return;

    const message = JSON.stringify({ type: 'stateUpdate', payload: lobby });

    wss.clients.forEach(client => {
        if (client.lobbyCode === lobbyCode && client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// --- PERSISTENCE & CLEANUP ---

function loadLobbiesFromDisk() {
    try {
        if (fs.existsSync(config.LOBBY_PERSISTENCE_FILE)) {
            const data = fs.readFileSync(config.LOBBY_PERSISTENCE_FILE, 'utf8');
            lobbies = JSON.parse(data);
            console.log('Lobbies loaded from disk.');
            // Reset participant status on load, as no one is connected
            for (const lobbyCode in lobbies) {
                const lobby = lobbies[lobbyCode];
                Object.values(lobby.participants).forEach(p => p.status = 'disconnected');
            }
        }
    } catch (error) {
        console.error('Error loading lobbies from disk:', error);
        lobbies = {};
    }
}

function cleanupInactiveLobbies() {
    const now = new Date();
    let changed = false;
    for (const lobbyCode in lobbies) {
        const lobby = lobbies[lobbyCode];
        const lastActivity = new Date(lobby.lastActivity);
        if (now - lastActivity > config.LOBBY_MAX_INACTIVE_TIME) {
            console.log(`Cleaning up inactive lobby: ${lobbyCode}`);
            delete lobbies[lobbyCode];
            changed = true;
        }
    }
    if (changed) {
        persistLobbiesToDisk();
    }
}

// Periodically clean up old lobbies
setInterval(cleanupInactiveLobbies, config.LOBBY_CLEANUP_INTERVAL);


module.exports = {
    createNewLobby,
    joinLobby,
    rejoinLobby,
    handleDisconnect,
    getLobby,
    getPublicLobbies,
    broadcastState,
    loadLobbiesFromDisk,
    persistLobbiesToDisk,
    updateLobbyActivity,
    getConfig: () => config,
    getConfigForClient: () => ({
        ROSTER_SIZE: config.ROSTER_SIZE,
        EGO_BAN_COUNT: config.EGO_BAN_COUNT,
    })
};
