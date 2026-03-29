// server/handlers/router.js
// WebSocket connection handler and lobby cleanup job.
// Call init(wss, crypto) after creating the WebSocket server, then startCleanupJob().

const { lobbies, lobbyTimers, VALID_ROLES } = require('../store');
const { logInfo, logError } = require('../utils/logger');
const { sanitizePlayerName } = require('../utils/sanitize');
const { rateLimit, RATE_LIMIT_WINDOW, RATE_LIMIT_MAX_REQUESTS } = require('../utils/rateLimit');
const { allIds } = require('../utils/idData');
const { sendError, validateRoster, validatePlayerAccess, validatePlayerNotReady, validateRefereeAccess } = require('../lobby/validation');
const { generateUniqueLobbyCode, createNewLobbyState, broadcastState, updateLobbyActivity } = require('../lobby/manager');
const { handleTimer, setTimerForLobby, computeBanPools, handleDraftConfirm } = require('./draftHandlers');

const LOBBY_TTL = 2 * 60 * 60 * 1000; // 2 hours

let _wss = null;
let _crypto = null;

function init(wss, crypto) {
    _wss = wss;
    _crypto = crypto;

    wss.on('connection', (ws, req) => {
        ws.remoteAddress = req.socket.remoteAddress;
        logInfo('CONNECTION', 'Client connected', { remoteAddress: ws.remoteAddress });

        ws.on('message', (message) => {
            let incomingData;
            try { incomingData = JSON.parse(message); }
            catch (e) { logError('WEBSOCKET', 'Invalid JSON received', message); return; }

            const { lobbyCode: rawLobbyCode, role, player, id, action, payload, name, roster, options, choice } = incomingData;
            const lobbyCode = rawLobbyCode ? rawLobbyCode.toUpperCase() : null;
            let lobbyData = lobbyCode ? lobbies[lobbyCode] : null;

            switch (incomingData.type) {
                case 'createLobby': {
                    const ip = ws.remoteAddress;
                    const now = Date.now();
                    rateLimit[ip] = (rateLimit[ip] || []).filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW);

                    if (rateLimit[ip].length >= RATE_LIMIT_MAX_REQUESTS) {
                        return sendError(ws, 'You are creating lobbies too quickly. Please wait.');
                    }
                    rateLimit[ip].push(now);

                    const newLobbyCode = generateUniqueLobbyCode();
                    const newLobbyState = createNewLobbyState(options);
                    ws.lobbyCode = newLobbyCode;
                    ws.userRole = 'ref';
                    ws.initialUserRole = 'ref';
                    const rejoinToken = _crypto.randomUUID();

                    newLobbyState.participants.ref.status = "connected";
                    newLobbyState.participants.ref.rejoinToken = rejoinToken;
                    ws.rejoinToken = rejoinToken;

                    lobbies[newLobbyCode] = newLobbyState;

                    ws.send(JSON.stringify({ type: 'lobbyCreated', code: newLobbyCode, role: 'ref', rejoinToken, state: newLobbyState }));
                    setTimerForLobby(newLobbyCode, newLobbyState);
                    broadcastState(newLobbyCode);
                    break;
                }

                case 'getLobbyInfo': {
                    if (!lobbyData) return sendError(ws, 'Lobby not found.');
                    ws.send(JSON.stringify({
                        type: 'lobbyInfo',
                        lobby: { code: lobbyCode, participants: lobbyData.participants }
                    }));
                    break;
                }

                case 'joinLobby': {
                    if (!lobbyData) return sendError(ws, 'Lobby not found.');
                    if (!VALID_ROLES.has(role)) return sendError(ws, 'Invalid role.');

                    const participant = lobbyData.participants[role];
                    if (participant && (participant.status === 'connected' || participant.rejoinToken)) {
                        return sendError(ws, `Role ${role.toUpperCase()} is taken or reserved.`);
                    }

                    ws.lobbyCode = lobbyCode;
                    ws.userRole = role;
                    ws.initialUserRole = role;
                    const rejoinToken = _crypto.randomUUID();

                    lobbyData.participants[role].status = 'connected';
                    lobbyData.participants[role].rejoinToken = rejoinToken;
                    if (name) lobbyData.participants[role].name = sanitizePlayerName(name);
                    ws.rejoinToken = rejoinToken;

                    updateLobbyActivity(lobbyCode);
                    ws.send(JSON.stringify({ type: 'lobbyJoined', lobbyCode: ws.lobbyCode, role, rejoinToken, state: lobbyData }));
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
                        sendError(ws, 'Failed to rejoin. Session might be invalid.');
                    }
                    break;
                }

                case 'rosterSelect': {
                    if (!validatePlayerAccess(ws, player, lobbyData)) return;
                    if (!validatePlayerNotReady(lobbyData, player)) return;
                    const currentRoster = lobbyData.roster[player];
                    const index = currentRoster.indexOf(id);
                    if (index === -1) { if (currentRoster.length < lobbyData.draft.rosterSize) currentRoster.push(id); }
                    else { currentRoster.splice(index, 1); }
                    updateLobbyActivity(lobbyCode);
                    broadcastState(lobbyCode);
                    break;
                }

                case 'rosterSet': {
                    if (!validatePlayerAccess(ws, player, lobbyData)) return;
                    if (!validatePlayerNotReady(lobbyData, player)) return;
                    if (validateRoster(roster, lobbyData.draft.rosterSize)) {
                        lobbyData.roster[player] = roster;
                        updateLobbyActivity(lobbyCode);
                        broadcastState(lobbyCode);
                    }
                    break;
                }

                case 'rosterRandomize': {
                    if (!validatePlayerAccess(ws, player, lobbyData)) return;
                    if (!validatePlayerNotReady(lobbyData, player)) return;
                    const shuffled = [...allIds].sort(() => 0.5 - Math.random());
                    lobbyData.roster[player] = shuffled.slice(0, lobbyData.draft.rosterSize);
                    updateLobbyActivity(lobbyCode);
                    broadcastState(lobbyCode);
                    break;
                }

                case 'rosterClear': {
                    if (!validatePlayerAccess(ws, player, lobbyData)) return;
                    lobbyData.roster[player] = [];
                    lobbyData.participants[player].ready = false;
                    updateLobbyActivity(lobbyCode);
                    broadcastState(lobbyCode);
                    break;
                }

                case 'updateReady': {
                    if (!validatePlayerAccess(ws, player, lobbyData)) return;
                    const currentReadyState = lobbyData.participants[player].ready;
                    if (!currentReadyState && lobbyData.roster[player].length !== lobbyData.draft.rosterSize) return;
                    lobbyData.participants[player].ready = !currentReadyState;
                    updateLobbyActivity(lobbyCode);
                    broadcastState(lobbyCode);
                    break;
                }

                case 'startCoinFlip': {
                    if (!validateRefereeAccess(ws, lobbyData)) return;
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
                        logInfo('DRAFT', 'Swapping P1 and P2 roles and data', { lobbyCode, coinFlipWinner: draft.coinFlipWinner, choice });
                        rolesSwapped = true;
                        [lobbyData.participants.p1, lobbyData.participants.p2] = [lobbyData.participants.p2, lobbyData.participants.p1];
                        [lobbyData.roster.p1, lobbyData.roster.p2] = [lobbyData.roster.p2, lobbyData.roster.p1];

                        _wss.clients.forEach(client => {
                            if (client.lobbyCode === lobbyCode) {
                                if (client.userRole === 'p1') client.userRole = 'p2';
                                else if (client.userRole === 'p2') client.userRole = 'p1';
                            }
                        });
                    }

                    draft.phase = 'egoBan';
                    draft.action = 'egoBan';
                    draft.currentPlayer = 'p1';
                    draft.step = 0;
                    draft.actionCount = 1;

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

                    if (['ban', 'pick', 'midBan', 'pick2', 'pick_s2'].includes(draft.phase)) {
                        const isBanAction = (draft.phase === 'ban' || draft.phase === 'midBan');
                        if (isBanAction) {
                            const bannableIds = draft.banPools[currentPlayer] || [];
                            if (!bannableIds.includes(hoveredId)) return;
                        } else {
                            const sourceList = draft.available[currentPlayer] || [];
                            if (!sourceList.includes(hoveredId)) return;
                        }
                    }

                    draft.hovered[currentPlayer] = (draft.hovered[currentPlayer] === hoveredId) ? null : hoveredId;
                    updateLobbyActivity(lobbyCode);
                    broadcastState(lobbyCode);
                    break;
                }

                case 'draftConfirm': {
                    if (!lobbyData) return;
                    handleDraftConfirm(lobbyCode, lobbyData, ws);
                    // Any confirmation (ban or pick) can change future bannable pools.
                    computeBanPools(lobbyData);
                    break;
                }

                case 'draftControl': {
                    if (!validateRefereeAccess(ws, lobbyData)) return;
                    if (action === 'confirmEgoBans') {
                        // Deprecated with alternating bans — kept to avoid errors.
                    } else if (action === 'complete') {
                        lobbyData.draft.phase = "complete";
                    }
                    updateLobbyActivity(lobbyCode);
                    setTimerForLobby(lobbyCode, lobbyData);
                    broadcastState(lobbyCode);
                    break;
                }

                case 'timerControl': {
                    if (!validateRefereeAccess(ws, lobbyData)) return;
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

                case 'keepAlive': {
                    if (!lobbyData) return;
                    updateLobbyActivity(lobbyCode);
                    ws.send(JSON.stringify({ type: 'keepAliveAck' }));
                    break;
                }
            }
        });

        ws.on('close', () => {
            logInfo('CONNECTION', 'Client disconnected', { remoteAddress: ws.remoteAddress, lobbyCode: ws.lobbyCode, userRole: ws.userRole });
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
}

function cleanupInactiveLobbies() {
    const now = new Date();
    for (const lobbyCode in lobbies) {
        const lastActivity = new Date(lobbies[lobbyCode].lastActivity);
        if (now - lastActivity > LOBBY_TTL) {
            logInfo('CLEANUP', 'Cleaning up inactive lobby', {
                lobbyCode,
                lastActivity: lastActivity.toISOString(),
                hoursInactive: Math.round((now - lastActivity) / (1000 * 60 * 60) * 10) / 10
            });
            if (lobbyTimers[lobbyCode] && lobbyTimers[lobbyCode].timeoutId) {
                clearTimeout(lobbyTimers[lobbyCode].timeoutId);
                delete lobbyTimers[lobbyCode];
            }
            delete lobbies[lobbyCode];
        }
    }
}

function startCleanupJob() {
    setInterval(cleanupInactiveLobbies, 30 * 60 * 1000);
}

module.exports = { init, startCleanupJob };
