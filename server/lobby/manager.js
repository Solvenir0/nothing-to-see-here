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

// Convert a DRAFT_LOGIC entry into a unified steps template.
// Steps are [{p:'p1'|'p2', type:'egoBan'|'idBan'|'idPick'|'idPickS2', c:number}, ...]
function buildTemplateFromLogic(logic, rosterSize) {
    const steps = [];
    for (let i = 0; i < (logic.egoBanSteps || 0); i++) {
        steps.push({ p: i % 2 === 0 ? 'p1' : 'p2', type: 'egoBan', c: 1 });
    }
    for (let i = 0; i < (logic.ban1Steps || 0); i++) {
        steps.push({ p: i % 2 === 0 ? 'p1' : 'p2', type: 'idBan', c: 1 });
    }
    for (const s of (logic.pick1 || [])) {
        steps.push({ p: s.p, type: 'idPick', c: s.c });
    }
    for (let i = 0; i < (logic.midBanSteps || 0); i++) {
        steps.push({ p: i % 2 === 0 ? 'p2' : 'p1', type: 'idBan', c: 1 });
    }
    for (const s of (logic.pick2 || [])) {
        steps.push({ p: s.p, type: 'idPick', c: s.c });
    }
    for (const s of (logic.pick_s2 || [])) {
        steps.push({ p: s.p, type: 'idPickS2', c: s.c });
    }
    return { rosterSize, steps };
}

function createNewLobbyState(options = {}) {
    const {
        customTemplate,
        draftLogic = '2-3-2',
        timerEnabled = false,
        timerSettings = null,
        name = 'Referee',
        matchType = 'section1',
        rosterSize = 42
    } = options;

    const resolvedTimerSettings = {
        egoBanTime:  20,
        idBanTime:   30,
        idPickTime:  30,
        reserveTime: 120,
        ...(timerSettings || {}),
    };

    let template;
    if (customTemplate) {
        template = customTemplate;
    } else {
        const fullLogicKey = matchType === 'allSections' ? `${draftLogic}-extended` : draftLogic;
        const currentLogic = DRAFT_LOGIC[fullLogicKey] || DRAFT_LOGIC[draftLogic];
        template = buildTemplateFromLogic(currentLogic, parseInt(rosterSize, 10));
    }

    const totalEgoBans = template.steps.filter(s => s.type === 'egoBan').reduce((sum, s) => sum + s.c, 0);

    return {
        hostName: sanitizePlayerName(name),
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        participants: {
            p1: { name: "Player 1", status: "disconnected", ready: false, rejoinToken: null, reserveTime: resolvedTimerSettings.reserveTime },
            p2: { name: "Player 2", status: "disconnected", ready: false, rejoinToken: null, reserveTime: resolvedTimerSettings.reserveTime },
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
            banPools: { p1: [], p2: [] },
            draftLogic: customTemplate ? 'custom' : draftLogic,
            matchType: customTemplate ? 'custom' : matchType,
            rosterSize: template.rosterSize,
            egoBanSteps: totalEgoBans,
            bannedIds: template.bannedIds || [],
            template,
            coinFlipWinner: null,
            turnOrderDecided: false,
            timerSettings: resolvedTimerSettings,
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
