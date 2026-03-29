// server/lobby/manager.js
// Lobby lifecycle helpers: creation, code generation, state update, broadcast.
// broadcastState is kept here and requires wss to be injected via init().

const { lobbies } = require('../store');
const { DRAFT_LOGIC } = require('../config/draftLogic');
const { sanitizePlayerName } = require('../utils/sanitize');

// wss is injected after the WebSocket server is created in server.js
let _wss = null;
let _WebSocket = null;

function init(wssInstance, WebSocketClass) {
    _wss = wssInstance;
    _WebSocket = WebSocketClass;
}

function generateUniqueLobbyCode() {
    let code;
    do {
        code = Math.random().toString(36).substring(2, 8).toUpperCase();
    } while (lobbies[code]);
    return code;
}

function createNewLobbyState(options = {}) {
    const { draftLogic = '2-3-2', timerEnabled = false, name = 'Referee', matchType = 'section1', rosterSize = 42 } = options;
    const fullLogicKey = matchType === 'allSections' ? `${draftLogic}-extended` : draftLogic;
    const currentLogic = DRAFT_LOGIC[fullLogicKey] || DRAFT_LOGIC[draftLogic];
    return {
        hostName: sanitizePlayerName(name),
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        participants: {
            p1: { name: "Player 1", status: "disconnected", ready: false, rejoinToken: null, reserveTime: 120 },
            p2: { name: "Player 2", status: "disconnected", ready: false, rejoinToken: null, reserveTime: 120 },
            ref: { name: sanitizePlayerName(name), status: "disconnected", rejoinToken: null }
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
            history: [],
            hovered: { p1: null, p2: null },
            // banPools.p1: IDs p1 may ban (derived from roster.p2 minus bans & p2 picks)
            // banPools.p2: IDs p2 may ban (derived from roster.p1 minus bans & p1 picks)
            banPools: { p1: [], p2: [] },
            draftLogic,
            matchType,
            rosterSize: parseInt(rosterSize, 10),
            egoBanSteps: currentLogic.egoBanSteps || 10,
            coinFlipWinner: null,
            timer: {
                enabled: timerEnabled,
                running: false,
                paused: false,
                endTime: 0,
                pauseTime: 0,
                isReserve: false,
                reserveStartTime: 0
            }
        }
    };
}

function broadcastState(lobbyCode, rolesSwapped = false) {
    const lobbyData = lobbies[lobbyCode];
    if (!lobbyData || !_wss) return;

    _wss.clients.forEach(client => {
        if (client.lobbyCode === lobbyCode && client.readyState === _WebSocket.OPEN) {
            const message = {
                type: 'stateUpdate',
                state: { ...lobbyData, rolesSwapped }
            };

            if (rolesSwapped) {
                if (client.initialUserRole === 'p1') {
                    message.newRole = 'p2';
                } else if (client.initialUserRole === 'p2') {
                    message.newRole = 'p1';
                }
            }
            client.send(JSON.stringify(message));
        }
    });
}

function updateLobbyActivity(lobbyCode) {
    if (lobbies[lobbyCode]) {
        lobbies[lobbyCode].lastActivity = new Date().toISOString();
    }
}

module.exports = {
    init,
    generateUniqueLobbyCode,
    createNewLobbyState,
    broadcastState,
    updateLobbyActivity,
};
