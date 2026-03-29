// server/handlers/draftHandlers.js
// Draft-phase logic: timers, phase advancement, ban pool computation, confirm handler.

const { lobbies, lobbyTimers } = require('../store');
const { TIMERS, DRAFT_LOGIC } = require('../config/draftLogic');
const { logInfo } = require('../utils/logger');
const { broadcastState, updateLobbyActivity } = require('../lobby/manager');

function handleTimer(lobbyCode) {
    let lobbyData = lobbies[lobbyCode];
    if (!lobbyData) return;

    const { draft } = lobbyData;
    const { currentPlayer } = draft;
    const participant = lobbyData.participants[currentPlayer];

    if (participant && participant.reserveTime > 0 && !draft.timer.isReserve) {
        logInfo('TIMER', `Main timer expired for ${currentPlayer}. Activating reserve time.`, { lobbyCode, currentPlayer });
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

    logInfo('TIMER', `Timer fully expired`, { lobbyCode, currentPlayer, phase, hoveredId });

    if (hoveredId) {
        handleDraftConfirm(lobbyCode, lobbyData, null);
        return;
    }

    logInfo('TIMER', 'Timer expired with no hover. Skipping turn by advancing phase.', { lobbyCode, currentPlayer });
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
            const totalEgoBans = draft.egoBanSteps || 10;
            // Total bans, so steps are 0 to totalEgoBans - 1
            if (draft.step < totalEgoBans - 1) {
                draft.step++;
                draft.currentPlayer = draft.currentPlayer === 'p1' ? 'p2' : 'p1';
                draft.actionCount = 1; // Each player bans 1 at a time
            } else {
                // EGO ban phase is over, move to ID bans
                draft.phase = "ban";
                draft.action = "ban";
                draft.step = 0;
                draft.currentPlayer = 'p1'; // P1 always starts ID bans
                draft.actionCount = 1;
                draft.available.p1 = [...lobbyData.roster.p1];
                draft.available.p2 = [...lobbyData.roster.p2];
                computeBanPools(lobbyData); // initialize ban pools for initial ban phase
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
                computeBanPools(lobbyData); // refresh ban pools for mid-ban phase
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

// Recompute the bannable pools for each player based on current rosters, bans, and ALL picks.
function computeBanPools(lobbyData) {
    if (!lobbyData || !lobbyData.draft) return;
    const { draft, roster } = lobbyData;

    // Create a comprehensive set of all IDs that are no longer in play
    const removedIds = new Set([
        ...draft.idBans.p1, ...draft.idBans.p2,
        ...draft.picks.p1, ...draft.picks.p2,
        ...draft.picks_s2.p1, ...draft.picks_s2.p2
    ]);

    const pools = { p1: [], p2: [] };

    // Player 1 can ban from Player 2's original roster, minus removed IDs
    pools.p1 = (roster.p2 || []).filter(id => !removedIds.has(id));

    // Player 2 can ban from Player 1's original roster, minus removed IDs
    pools.p2 = (roster.p1 || []).filter(id => !removedIds.has(id));

    draft.banPools = pools;
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
        if (isBanAction) {
            // Validate against the authoritative ban pool
            const bannableIds = draft.banPools[currentPlayer] || [];
            if (!bannableIds.includes(selectedId)) {
                return; // Invalid ban attempt
            }
        } else {
            const sourceList = draft.available[currentPlayer] || [];
            if (!sourceList.includes(selectedId)) return;
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
        if (!playerBans.includes(selectedId)) {
            playerBans.push(selectedId);
            draft.history.push({ type: 'EGO_BAN', player: currentPlayer, targetId: selectedId });
        }

        draft.hovered[currentPlayer] = null; // Clear hover after successful ban

        // After one ban, advance the phase to the next player's turn
        lobbyData = advancePhase(lobbyData);
        setTimerForLobby(lobbyCode, lobbyData);

        updateLobbyActivity(lobbyCode);
        broadcastState(lobbyCode);
        return; // Exit here.
    }

    if (['ban', 'pick', 'midBan', 'pick2', 'pick_s2'].includes(phase)) {
        if (draft.actionCount <= 0) return;

        let listToUpdate;
        const isBanAction = (phase === 'ban' || phase === 'midBan');
        let eventType = '';

        if (isBanAction) {
            listToUpdate = draft.idBans[currentPlayer];
            eventType = 'ID_BAN';
        } else if (phase === 'pick' || phase === 'pick2' || phase === 'pick_s2') {
            listToUpdate = (phase === 'pick_s2') ? draft.picks_s2[currentPlayer] : draft.picks[currentPlayer];
            eventType = 'ID_PICK';
        }

        if (listToUpdate) {
            listToUpdate.push(selectedId);
            draft.history.push({ type: eventType, player: currentPlayer, targetId: selectedId });
        }
        // Always remove the chosen ID from both availability lists (bans deny globally; picks lock globally)
        ['p1', 'p2'].forEach(p => {
            const idx = draft.available[p].indexOf(selectedId);
            if (idx > -1) draft.available[p].splice(idx, 1);
        });

        draft.actionCount--;

        if (draft.actionCount <= 0) {
            lobbyData = advancePhase(lobbyData);
        }
    }

    draft.hovered[currentPlayer] = null;
    updateLobbyActivity(lobbyCode);

    // Set timer for the next phase/turn (this is correct for ID picks/bans which are per-action)
    setTimerForLobby(lobbyCode, lobbyData);

    broadcastState(lobbyCode);
}

module.exports = { handleTimer, setTimerForLobby, advancePhase, computeBanPools, handleDraftConfirm };
