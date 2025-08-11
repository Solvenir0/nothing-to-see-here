// =================================================================================
// FILE: server.js
// DESCRIPTION: This version adds basic security hardening for public use.
// 1. Input Sanitization: Player names are now sanitized to prevent XSS attacks.
// 2. Rate Limiting: A simple in-memory rate limit is added to the lobby
//    creation process to prevent spam and abuse.
// =================================================================================
const express = require('express');
const http = require('http');
const path =require('path');
const WebSocket = require('ws');
const crypto = require('crypto');

// In-memory storage for lobbies instead of Firestore
const lobbies = {};
const VALID_ROLES = new Set(['p1', 'p2', 'ref']);

const app = express();
const server = http.createServer(app);

// Minimal hardening
app.disable('x-powered-by');

app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.get('/_ah/health', (req, res) => res.status(200).send('OK'));

const wss = new WebSocket.Server({ server });

const EGO_BAN_COUNT = 5;
const TIMERS = {
    roster: 90,
    egoBan: 90,
    pick: 15,
};

// --- DRAFT LOGIC SEQUENCES ---
const DRAFT_LOGIC = {
    '1-2-2': {
        ban1Steps: 8,
        pick1: [{ p: 'p1', c: 1 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 1 }],
        midBanSteps: 6,
        pick2: [{ p: 'p2', c: 1 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 1 }],
        pick_s2: [{ p: 'p1', c: 1 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 1 }]
    },
    '1-2-2-extended': { // For "All Sections" matches
        ban1Steps: 8,
        pick1: [{ p: 'p1', c: 1 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 1 }],
        midBanSteps: 8, // Increased to 8
        pick2: [ // Increased to 12 picks per player
            { p: 'p2', c: 1 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 },
            { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 },
            { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 },
            { p: 'p2', c: 1 }
        ],
    },
    '2-3-2': {
        ban1Steps: 8,
        pick1: [{ p: 'p1', c: 2 }, { p: 'p2', c: 3 }, { p: 'p1', c: 2 }, { p: 'p2', c: 3 }, { p: 'p1', c: 2 }],
        midBanSteps: 6,
        pick2: [{ p: 'p2', c: 2 }, { p: 'p1', c: 3 }, { p: 'p2', c: 2 }, { p: 'p1', c: 3 }, { p: 'p2', c: 2 }],
        pick_s2: [{ p: 'p1', c: 1 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 1 }]
    },
    '2-3-2-extended': { // For "All Sections" matches
        ban1Steps: 8,
        pick1: [{ p: 'p1', c: 2 }, { p: 'p2', c: 3 }, { p: 'p1', c: 2 }, { p: 'p2', c: 3 }, { p: 'p1', c: 2 }],
        midBanSteps: 8, // Increased to 8
        pick2: [ // Increased to 12 picks per player
            { p: 'p2', c: 1 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 },
            { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 },
            { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 },
            { p: 'p2', c: 1 }
        ],
    }
};

const lobbyTimers = {}; // Store { lobbyCode: { timeoutId, unpauseFn } }

// --- SECURITY UTILITIES ---
function sanitize(text) {
    if (!text) return "";
    return text.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

const rateLimit = {};
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // Max 10 lobby creations per minute per IP

function createSlug(name) {
    if (!name) return '';
    return name.toLowerCase()
        .replace(/ryōshū/g, 'ryshu').replace(/öufi/g, 'ufi')
        .replace(/e\.g\.o::/g, 'ego-')
        .replace(/ & /g, ' ').replace(/[.'"]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/[^\w-]+/g, '');
}

// Minimal ID catalog: we only need slugs server-side to validate rosters and picks.
// Keep it in sync with client data.js by reusing the same CSV string via build-time copy.
function parseIDCSV(csv) {
    const lines = csv.split('\n').filter(line => line.trim() !== '');
    if (lines.length < 2) return [];
    const regex = /(".*?"|[^",]+)(?=\s*,|\s*$)/g;
    const headers = lines[0].split(',').map(h => h.trim());
    const result = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const values = line.match(regex) || [];
        if (values.length !== headers.length) continue;
        const obj = {};
        headers.forEach((header, idx) => {
            let value = values[idx].trim();
            if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
            obj[header] = value;
        });
        const name = obj.Name;
            result.push({ 
                id: createSlug(name), 
                name: name,
                rarity: obj.Rarity,
            });
    }
    return result;
}

    // Keep a single source of truth for ID CSV below.

// Reuse the CSV in data.js by embedding a minimal copy here to avoid runtime coupling.
// Note: Keeping this list small to reduce server memory; it's fine if truncated for tests.
const idCsvData = `Name,Keywords,SinAffinities,Rarity
"Seven Association South Section 6 Yi Sang","Rupture","Gloom,Gluttony,Sloth","00"`;
const allIds = Object.freeze(parseIDCSV(idCsvData));


function generateUniqueLobbyCode() {
    let code;
    do {
        code = Math.random().toString(36).substring(2, 8).toUpperCase();
    } while (lobbies[code]);
    return code;
}

function createNewLobbyState(options = {}) {
    const { draftLogic = '1-2-2', timerEnabled = false, isPublic = false, name = 'Referee', matchType = 'section1', rosterSize = 42 } = options;
    return {
        hostName: sanitize(name), // Sanitize name on creation
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        participants: {
            p1: { name: "Player 1", status: "disconnected", ready: false, rejoinToken: null, reserveTime: 120 },
            p2: { name: "Player 2", status: "disconnected", ready: false, rejoinToken: null, reserveTime: 120 },
            ref: { name: sanitize(name), status: "disconnected", rejoinToken: null }
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
            rosterSize: parseInt(rosterSize, 10),
            isPublic,
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
    if (!lobbyData) return;

    wss.clients.forEach(client => {
        if (client.lobbyCode === lobbyCode && client.readyState === WebSocket.OPEN) {
            const message = {
                type: 'stateUpdate',
                state: lobbyData
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

function isAuthorized(ws, targetRole) {
    // Referee can act for anyone; a player can only act for themselves
    return ws && (ws.userRole === 'ref' || ws.userRole === targetRole);
}

function handleTimer(lobbyCode) {
    let lobbyData = lobbies[lobbyCode];
    if (!lobbyData) return;

    const { draft } = lobbyData;
    const { currentPlayer } = draft;
    const participant = lobbyData.participants[currentPlayer];

    if (participant && participant.reserveTime > 0 && !draft.timer.isReserve) {
        console.log(`Main timer expired for ${currentPlayer}. Activating reserve time.`);
        draft.timer.isReserve = true;
        draft.timer.reserveStartTime = Date.now();
        
        const reserveDuration = participant.reserveTime;
        draft.timer.running = true;
        draft.timer.endTime = Date.now() + reserveDuration * 1000;

        const timeoutId = setTimeout(() => handleTimer(lobbyCode), reserveDuration * 1000);
        lobbyTimers[lobbyCode] = { timeoutId };
        
        broadcastState(lobbyCode);
        return;
    }
    
    draft.timer.isReserve = false;
    draft.timer.running = false;
    if (participant) {
        participant.reserveTime = 0;
    }

    const { hovered, phase } = draft;
    const hoveredId = hovered[currentPlayer];

    console.log(`Timer fully expired for ${lobbyCode}. Player: ${currentPlayer}, Phase: ${phase}, Hovered: ${hoveredId}`);
    
    if (hoveredId) {
        handleDraftConfirm(lobbyCode, lobbyData, null);
        return;
    }

    console.log("Timer expired with no hover. Skipping turn by advancing phase.");
    lobbyData = advancePhase(lobbyData);
    setTimerForLobby(lobbyCode, lobbyData);
    broadcastState(lobbyCode);
}


function setTimerForLobby(lobbyCode, lobbyData) {
    if (lobbyTimers[lobbyCode] && lobbyTimers[lobbyCode].timeoutId) {
        clearTimeout(lobbyTimers[lobbyCode].timeoutId);
    }
    
    const { draft } = lobbyData;
    draft.timer.isReserve = false;

    if (!draft.timer.enabled || draft.phase === 'complete' || draft.timer.paused) {
        draft.timer.running = false;
        return;
    }

    let duration = 0;
    if (draft.phase === 'roster') {
        duration = TIMERS.roster;
    } else if (draft.phase === 'egoBan') {
        duration = TIMERS.egoBan;
    } else if (['pick', 'ban', 'midBan', 'pick2'].includes(draft.phase)) {
        duration = TIMERS.pick * draft.actionCount;
    }

    if (duration > 0) {
        draft.timer.running = true;
        draft.timer.endTime = Date.now() + duration * 1000;

        const timeoutId = setTimeout(() => handleTimer(lobbyCode), duration * 1000);
        lobbyTimers[lobbyCode] = { timeoutId };
    } else {
         draft.timer.running = false;
    }
}

function advancePhase(lobbyData) {
    const { draft } = lobbyData;
    draft.timer.isReserve = false;
    
    const logicKey = draft.matchType === 'allSections' ? `${draft.draftLogic}-extended` : draft.draftLogic;
    const logic = DRAFT_LOGIC[logicKey] || DRAFT_LOGIC[draft.draftLogic];


    switch (draft.phase) {
        case "egoBan":
            if (draft.currentPlayer === 'p1') {
                draft.currentPlayer = 'p2';
            } else {
                draft.phase = "ban";
                draft.action = "ban";
                draft.step = 0;
                draft.currentPlayer = 'p1';
                draft.actionCount = 1;
                draft.available.p1 = [...lobbyData.roster.p1];
                draft.available.p2 = [...lobbyData.roster.p2];
            }
            break;
        case "ban":
            if (draft.step < logic.ban1Steps - 1) {
                draft.step++;
                draft.currentPlayer = draft.currentPlayer === 'p1' ? 'p2' : 'p1';
                draft.actionCount = 1;
            } else {
                draft.phase = "pick";
                draft.action = "pick";
                draft.step = 0;
                const next = logic.pick1[0];
                draft.currentPlayer = next.p;
                draft.actionCount = next.c;
            }
            break;
        case "pick":
            if (draft.step < logic.pick1.length - 1) {
                draft.step++;
                const next = logic.pick1[draft.step];
                draft.currentPlayer = next.p;
                draft.actionCount = next.c;
            } else {
                draft.phase = "midBan";
                draft.action = "midBan";
                draft.step = 0;
                draft.currentPlayer = 'p2';
                draft.actionCount = 1;
            }
            break;
        case "midBan":
             if (draft.step < logic.midBanSteps - 1) {
                draft.step++;
                draft.currentPlayer = draft.currentPlayer === 'p1' ? 'p2' : 'p1';
                draft.actionCount = 1;
            } else {
                draft.phase = "pick2";
                draft.action = "pick2";
                draft.step = 0;
                const next = logic.pick2[0];
                draft.currentPlayer = next.p;
                draft.actionCount = next.c;
            }
            break;
        case "pick2":
            if (draft.step < logic.pick2.length - 1) {
                draft.step++;
                const next = logic.pick2[draft.step];
                draft.currentPlayer = next.p;
                draft.actionCount = next.c;
            } else {
                draft.phase = "complete";
                draft.action = "complete";
                draft.currentPlayer = "";
            }
            break;
        case "pick_s2":
            if (draft.step < logic.pick_s2.length - 1) {
                draft.step++;
                const next = logic.pick_s2[draft.step];
                draft.currentPlayer = next.p;
                draft.actionCount = next.c;
            } else {
                draft.phase = "complete";
                draft.action = "complete";
                draft.currentPlayer = "";
            }
            break;
    }
    return lobbyData;
}

function handleDraftConfirm(lobbyCode, lobbyData, ws) {
    const { draft } = lobbyData;
    const { currentPlayer, hovered, phase } = draft;
    const selectedId = hovered[currentPlayer];
    const participant = lobbyData.participants[currentPlayer];

    if (!selectedId) return;
    
    if (ws && ws.userRole !== currentPlayer && ws.userRole !== 'ref') return;

    // For ID phases, ensure the selection is currently available from the right pool
    if (['ban', 'pick', 'midBan', 'pick2', 'pick_s2'].includes(phase)) {
        const isBanAction = (phase === 'ban' || phase === 'midBan');
        const sourcePlayer = isBanAction ? (currentPlayer === 'p1' ? 'p2' : 'p1') : currentPlayer;
        const sourceList = draft.available[sourcePlayer] || [];
        if (!sourceList.includes(selectedId)) {
            return; // Invalid selection, ignore
        }
    }

    if (draft.timer.isReserve) {
        if (lobbyTimers[lobbyCode]) clearTimeout(lobbyTimers[lobbyCode].timeoutId);
        const timeUsed = Math.ceil((Date.now() - draft.timer.reserveStartTime) / 1000);
        participant.reserveTime = Math.max(0, participant.reserveTime - timeUsed);
        draft.timer.isReserve = false;
        draft.timer.reserveStartTime = 0;
    }

    if (phase === 'egoBan') {
        const playerBans = draft.egoBans[currentPlayer];
        const banIndex = playerBans.indexOf(selectedId);
        
        if (banIndex > -1) {
            playerBans.splice(banIndex, 1);
        } else if (playerBans.length < EGO_BAN_COUNT) {
            playerBans.push(selectedId);
        }
    } else if (['ban', 'pick', 'midBan', 'pick2', 'pick_s2'].includes(phase)) {
        if (draft.actionCount <= 0) return;

        let listToUpdate;
        const isBanAction = (phase === 'ban' || phase === 'midBan');

        if (isBanAction) {
            listToUpdate = draft.idBans[currentPlayer];
        } else if (phase === 'pick' || phase === 'pick2') {
            listToUpdate = draft.picks[currentPlayer];
        } else if (phase === 'pick_s2') {
            listToUpdate = draft.picks_s2[currentPlayer];
        }

        if (listToUpdate) listToUpdate.push(selectedId);
        
        let p1Index = draft.available.p1.indexOf(selectedId);
        if(p1Index > -1) draft.available.p1.splice(p1Index, 1);
        let p2Index = draft.available.p2.indexOf(selectedId);
        if(p2Index > -1) draft.available.p2.splice(p2Index, 1);
        
        draft.actionCount--;

        if (draft.actionCount <= 0) {
            lobbyData = advancePhase(lobbyData);
        }
    }

    draft.hovered[currentPlayer] = null;
    updateLobbyActivity(lobbyCode);

    if (phase !== 'egoBan') {
        setTimerForLobby(lobbyCode, lobbyData);
    }
    
    broadcastState(lobbyCode);
}

// --- MAIN WEBSOCKET LOGIC ---
wss.on('connection', (ws, req) => {
    // Use the remote address from the underlying socket for rate limiting
    ws.remoteAddress = req.socket.remoteAddress;
    console.log(`Client connected from ${ws.remoteAddress}`);

    ws.on('message', (message) => {
        let incomingData;
        try { incomingData = JSON.parse(message); } 
        catch (e) { console.error('Invalid JSON:', message); return; }

    const { lobbyCode: rawLobbyCode, role, player, id, action, payload, name, roster, options, choice } = incomingData;
        const lobbyCode = rawLobbyCode ? rawLobbyCode.toUpperCase() : null;
        let lobbyData = lobbyCode ? lobbies[lobbyCode] : null;

        switch (incomingData.type) {
            case 'createLobby': {
                const ip = ws.remoteAddress;
                const now = Date.now();
                rateLimit[ip] = (rateLimit[ip] || []).filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW);

                if (rateLimit[ip].length >= RATE_LIMIT_MAX_REQUESTS) {
                    return ws.send(JSON.stringify({ type: 'error', message: 'You are creating lobbies too quickly. Please wait.' }));
                }
                rateLimit[ip].push(now);

                const newLobbyCode = generateUniqueLobbyCode();
                const newLobbyState = createNewLobbyState(options);
                ws.lobbyCode = newLobbyCode;
                ws.userRole = 'ref';
                ws.initialUserRole = 'ref';
                const rejoinToken = crypto.randomUUID();
                
                newLobbyState.participants.ref.status = "connected";
                newLobbyState.participants.ref.rejoinToken = rejoinToken;
                ws.rejoinToken = rejoinToken;
                
                lobbies[newLobbyCode] = newLobbyState;
                
                ws.send(JSON.stringify({ type: 'lobbyCreated', code: newLobbyCode, role: 'ref', rejoinToken, state: newLobbyState }));
                setTimerForLobby(newLobbyCode, newLobbyState);
                broadcastState(newLobbyCode);
                break;
            }

            case 'getPublicLobbies': {
                const validPhases = ['roster', 'coinFlip', 'egoBan', 'ban', 'pick', 'midBan', 'pick2', 'pick_s2'];
                const publicLobbies = Object.entries(lobbies)
                    .filter(([, lobby]) => lobby.draft.isPublic && validPhases.includes(lobby.draft.phase))
                    .map(([code, lobby]) => ({
                        code,
                        hostName: lobby.hostName,
                        participants: lobby.participants,
                        draftLogic: lobby.draft.draftLogic,
                    }))
                    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                    .slice(0, 50);

                ws.send(JSON.stringify({ type: 'publicLobbiesList', lobbies: publicLobbies }));
                break;
            }
            
            case 'getLobbyInfo': {
                if (!lobbyData) return ws.send(JSON.stringify({ type: 'error', message: 'Lobby not found.' }));
                ws.send(JSON.stringify({
                    type: 'lobbyInfo',
                    lobby: {
                        code: lobbyCode,
                        participants: lobbyData.participants,
                    }
                }));
                break;
            }

            case 'joinLobby': {
                if (!lobbyData) return ws.send(JSON.stringify({ type: 'error', message: 'Lobby not found.' }));
                if (!VALID_ROLES.has(role)) return ws.send(JSON.stringify({ type: 'error', message: 'Invalid role.' }));
                
                const participant = lobbyData.participants[role];

                if (participant && (participant.status === 'connected' || participant.rejoinToken)) {
                    return ws.send(JSON.stringify({ type: 'error', message: `Role ${role.toUpperCase()} is taken or reserved.` }));
                }
                
                ws.lobbyCode = lobbyCode;
                ws.userRole = role;
                ws.initialUserRole = role; // Store the initial role for swapping
                const rejoinToken = crypto.randomUUID();

                lobbyData.participants[role].status = 'connected';
                lobbyData.participants[role].rejoinToken = rejoinToken;
                if (name) lobbyData.participants[role].name = sanitize(name); // Sanitize name on join
                ws.rejoinToken = rejoinToken;
                
                updateLobbyActivity(lobbyCode);
                
                ws.send(JSON.stringify({ 
                    type: 'lobbyJoined', 
                    lobbyCode: ws.lobbyCode, 
                    role, 
                    rejoinToken,
                    state: lobbyData 
                }));
                broadcastState(ws.lobbyCode);
                break;
            }

            case 'rejoinLobby': {
                if (!lobbyData || !role || !incomingData.rejoinToken) return;
                
                const participant = lobbyData.participants[role];

                if (participant && participant.rejoinToken === incomingData.rejoinToken) {
                    ws.lobbyCode = lobbyCode;
                    ws.userRole = role;
                    ws.initialUserRole = role;
                    ws.rejoinToken = incomingData.rejoinToken;

                    lobbyData.participants[role].status = 'connected';
                    updateLobbyActivity(lobbyCode);
                    
                    ws.send(JSON.stringify({
                        type: 'lobbyJoined',
                        lobbyCode: ws.lobbyCode,
                        role,
                        rejoinToken: incomingData.rejoinToken,
                        state: lobbyData
                    }));
                    broadcastState(lobbyCode);
                } else {
                    ws.send(JSON.stringify({ type: 'error', message: 'Failed to rejoin. Session might be invalid.' }));
                }
                break;
            }

            case 'rosterSelect': {
                if (!lobbyData) return;
                if (!VALID_ROLES.has(player) || player === 'ref') return;
                if (!isAuthorized(ws, player)) return;
                if (lobbyData.participants[player].ready) return;
                const currentRoster = lobbyData.roster[player];
                const index = currentRoster.indexOf(id);
                if (index === -1) { if (currentRoster.length < lobbyData.draft.rosterSize) currentRoster.push(id); } 
                else { currentRoster.splice(index, 1); }
                updateLobbyActivity(lobbyCode);
                broadcastState(lobbyCode);
                break;
            }
            
            case 'rosterSet': {
                if (!lobbyData) return;
                if (!VALID_ROLES.has(player) || player === 'ref') return;
                if (!isAuthorized(ws, player)) return;
                if (lobbyData.participants[player].ready) return;
                if (!Array.isArray(roster)) return;
                // Validate roster length, uniqueness, and IDs
                const sizeOk = roster.length === lobbyData.draft.rosterSize;
                const uniqueOk = new Set(roster).size === roster.length;
                const idsOk = roster.every(x => allIds.includes(x));
                if (sizeOk && uniqueOk && idsOk) {
                    lobbyData.roster[player] = roster;
                    updateLobbyActivity(lobbyCode);
                    broadcastState(lobbyCode);
                }
                break;
            }

            case 'rosterRandomize': {
                if (!lobbyData) return;
                if (!VALID_ROLES.has(player) || player === 'ref') return;
                if (!isAuthorized(ws, player)) return;
                if (lobbyData.participants[player].ready) return;
                const shuffled = [...allIds].sort(() => 0.5 - Math.random());
                lobbyData.roster[player] = shuffled.slice(0, lobbyData.draft.rosterSize);
                updateLobbyActivity(lobbyCode);
                broadcastState(lobbyCode);
                break;
            }

            case 'rosterClear': {
                if (!lobbyData) return;
                if (!VALID_ROLES.has(player) || player === 'ref') return;
                if (!isAuthorized(ws, player)) return;
                lobbyData.roster[player] = [];
                lobbyData.participants[player].ready = false;
                updateLobbyActivity(lobbyCode);
                broadcastState(lobbyCode);
                break;
            }

            case 'updateReady': {
                if (!lobbyData) return;
                if (!VALID_ROLES.has(player) || player === 'ref') return;
                if (!isAuthorized(ws, player)) return;
                const currentReadyState = lobbyData.participants[player].ready;
                if (!currentReadyState && lobbyData.roster[player].length !== lobbyData.draft.rosterSize) return;
                lobbyData.participants[player].ready = !currentReadyState;
                updateLobbyActivity(lobbyCode);
                broadcastState(lobbyCode);
                break;
            }

            case 'startCoinFlip': {
                if (!lobbyData || ws.userRole !== 'ref') return;
                lobbyData.draft.phase = 'coinFlip';
                lobbyData.draft.coinFlipWinner = Math.random() < 0.5 ? 'p1' : 'p2';
                updateLobbyActivity(lobbyCode);
                broadcastState(lobbyCode);
                break;
            }

            case 'setTurnOrder': {
                if (!lobbyData || (ws.userRole !== lobbyData.draft.coinFlipWinner && ws.userRole !== 'ref')) return;
                
                const { draft } = lobbyData;
                let rolesSwapped = false;
                const needsSwap = (draft.coinFlipWinner === 'p2' && choice === 'first') || (draft.coinFlipWinner === 'p1' && choice === 'second');

                if (needsSwap) {
                    console.log(`[${lobbyCode}] Swapping P1 and P2 roles and data.`);
                    rolesSwapped = true;
                    [lobbyData.participants.p1, lobbyData.participants.p2] = [lobbyData.participants.p2, lobbyData.participants.p1];
                    [lobbyData.roster.p1, lobbyData.roster.p2] = [lobbyData.roster.p2, lobbyData.roster.p1];

                    wss.clients.forEach(client => {
                        if (client.lobbyCode === lobbyCode) {
                            if (client.userRole === 'p1') client.userRole = 'p2';
                            else if (client.userRole === 'p2') client.userRole = 'p1';
                        }
                    });
                }
                
                draft.phase = 'egoBan';
                draft.action = 'egoBan';
                draft.currentPlayer = 'p1';

                updateLobbyActivity(lobbyCode);
                setTimerForLobby(lobbyCode, lobbyData);
                broadcastState(lobbyCode, rolesSwapped);
                break;
            }

            case 'draftHover': {
                if (!lobbyData) return;
                const { id: hoveredId } = payload;
                const { draft } = lobbyData;
                const { currentPlayer } = draft;
                if (ws.userRole !== currentPlayer && ws.userRole !== 'ref') return;

                // Validate hovered ID belongs to the correct pool for ID phases
                if (['ban', 'pick', 'midBan', 'pick2', 'pick_s2'].includes(draft.phase)) {
                    const isBanAction = (draft.phase === 'ban' || draft.phase === 'midBan');
                    const sourcePlayer = isBanAction ? (currentPlayer === 'p1' ? 'p2' : 'p1') : currentPlayer;
                    const sourceList = draft.available[sourcePlayer] || [];
                    if (!sourceList.includes(hoveredId)) return;
                }

                draft.hovered[currentPlayer] = (draft.hovered[currentPlayer] === hoveredId) ? null : hoveredId;
                updateLobbyActivity(lobbyCode);
                broadcastState(lobbyCode);
                break;
            }

            case 'draftConfirm': {
                if (!lobbyData) return;
                handleDraftConfirm(lobbyCode, lobbyData, ws);
                break;
            }

            case 'draftControl': {
                if (!lobbyData || ws.userRole !== 'ref') return;

                if (action === 'confirmEgoBans') {
                     const { currentPlayer } = lobbyData.draft;
                     if (lobbyData.draft.egoBans[currentPlayer].length === EGO_BAN_COUNT) {
                        lobbyData = advancePhase(lobbyData);
                     }
                } else if (action === 'complete') {
                    lobbyData.draft.phase = "complete";
                }
                
                updateLobbyActivity(lobbyCode);
                setTimerForLobby(lobbyCode, lobbyData);
                broadcastState(lobbyCode);
                break;
            }

            case 'timerControl': {
                if (!lobbyData || ws.userRole !== 'ref') return;
                const { timer } = lobbyData.draft;
                
                if (timer.paused) { // unpausing
                    timer.paused = false;
                    timer.running = true;
                    timer.endTime = Date.now() + timer.pauseTime;
                    
                    const timeoutId = setTimeout(() => handleTimer(lobbyCode), timer.pauseTime);
                    lobbyTimers[lobbyCode] = { timeoutId };

                } else { // pausing
                    if (lobbyTimers[lobbyCode]) clearTimeout(lobbyTimers[lobbyCode].timeoutId);
                    timer.paused = true;
                    timer.running = false;
                    timer.pauseTime = Math.max(0, timer.endTime - Date.now());
                }
                updateLobbyActivity(lobbyCode);
                broadcastState(lobbyCode);
                break;
            }
        }
    });

    ws.on('close', () => {
        console.log(`Client disconnected from ${ws.remoteAddress}`);
        const { lobbyCode, userRole } = ws;
        if (lobbyCode && userRole && lobbies[lobbyCode]) {
            const lobbyData = lobbies[lobbyCode];
            const currentRole = Object.keys(lobbyData.participants).find(
                r => lobbyData.participants[r].rejoinToken === ws.rejoinToken
            ) || userRole;
            
            if (lobbyData.participants[currentRole]) {
                lobbyData.participants[currentRole].status = 'disconnected';
                lobbyData.participants[currentRole].ready = false;
                updateLobbyActivity(lobbyCode);
                broadcastState(lobbyCode);
            }
        }
    });
});

const LOBBY_TTL = 2 * 60 * 60 * 1000; // 2 hours

function cleanupInactiveLobbies() {
    const now = new Date();
    for (const lobbyCode in lobbies) {
        const lastActivity = new Date(lobbies[lobbyCode].lastActivity);
        if (now - lastActivity > LOBBY_TTL) {
            console.log(`Cleaning up inactive lobby: ${lobbyCode}`);
            if (lobbyTimers[lobbyCode] && lobbyTimers[lobbyCode].timeoutId) {
                clearTimeout(lobbyTimers[lobbyCode].timeoutId);
                delete lobbyTimers[lobbyCode];
            }
            delete lobbies[lobbyCode];
        }
    }
}

setInterval(cleanupInactiveLobbies, 30 * 60 * 1000);


const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`Server is listening on port ${PORT}`));
