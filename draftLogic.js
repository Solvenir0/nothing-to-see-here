// =================================================================================
// FILE: draftLogic.js
// DESCRIPTION: Encapsulates the core state machine and rules for the draft process.
//              Handles phase transitions and draft actions like picking and banning.
// =================================================================================
const config = require('./config');

const DRAFT_SEQUENCES = {
    '1-2-2': {
        ban1Steps: 8,
        pick1: [{ p: 'p1', c: 1 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 1 }],
        midBanSteps: 6,
        pick2: [{ p: 'p2', c: 1 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 1 }],
        pick_s2: [{ p: 'p1', c: 1 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 1 }]
    },
    '2-3-2': {
        ban1Steps: 8,
        pick1: [{ p: 'p1', c: 2 }, { p: 'p2', c: 3 }, { p: 'p1', c: 2 }, { p: 'p2', c: 3 }, { p: 'p1', c: 2 }],
        midBanSteps: 6,
        pick2: [{ p: 'p2', c: 2 }, { p: 'p1', c: 3 }, { p: 'p2', c: 2 }, { p: 'p1', c: 3 }, { p: 'p2', c: 2 }],
        pick_s2: [{ p: 'p1', c: 1 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 1 }]
    }
};

function advancePhase(lobby) {
    const { draft } = lobby;
    const logic = DRAFT_SEQUENCES[draft.draftLogic];
    const [firstPlayer, secondPlayer] = draft.playerOrder;
    const getPlayer = (p) => (p === 'p1' ? firstPlayer : secondPlayer);

    // Helper to reset hover state
    const resetHover = () => {
        draft.hovered = { p1: null, p2: null };
    };

    switch (draft.phase) {
        case "egoBan":
            resetHover();
            if (draft.currentPlayer === firstPlayer) {
                draft.currentPlayer = secondPlayer;
            } else {
                draft.phase = "ban";
                draft.action = "ban";
                draft.step = 0;
                draft.currentPlayer = firstPlayer;
                draft.actionCount = 1;
                // Initialize available pools for the draft
                draft.available.p1 = [...lobby.roster.p1];
                draft.available.p2 = [...lobby.roster.p2];
            }
            break;
        case "ban":
            resetHover();
            if (draft.step < logic.ban1Steps - 1) {
                draft.step++;
                draft.currentPlayer = draft.currentPlayer === firstPlayer ? secondPlayer : firstPlayer;
                draft.actionCount = 1;
            } else {
                draft.phase = "pick";
                draft.action = "pick";
                draft.step = 0;
                const next = logic.pick1[0];
                draft.currentPlayer = getPlayer(next.p);
                draft.actionCount = next.c;
            }
            break;
        case "pick":
            resetHover();
            if (draft.step < logic.pick1.length - 1) {
                draft.step++;
                const next = logic.pick1[draft.step];
                draft.currentPlayer = getPlayer(next.p);
                draft.actionCount = next.c;
            } else {
                draft.phase = "midBan";
                draft.action = "midBan";
                draft.step = 0;
                draft.currentPlayer = firstPlayer;
                draft.actionCount = 1;
            }
            break;
        case "midBan":
            resetHover();
            if (draft.step < logic.midBanSteps - 1) {
                draft.step++;
                draft.currentPlayer = draft.currentPlayer === firstPlayer ? secondPlayer : firstPlayer;
                draft.actionCount = 1;
            } else {
                draft.phase = "pick2";
                draft.action = "pick2";
                draft.step = 0;
                const next = logic.pick2[0];
                draft.currentPlayer = getPlayer(next.p);
                draft.actionCount = next.c;
            }
            break;
        case "pick2":
            resetHover();
            if (draft.step < logic.pick2.length - 1) {
                draft.step++;
                const next = logic.pick2[draft.step];
                draft.currentPlayer = getPlayer(next.p);
                draft.actionCount = next.c;
            } else {
                if (draft.matchType === 'allSections') {
                    draft.phase = "pick_s2";
                    draft.action = "pick_s2";
                    draft.step = 0;
                    const next = logic.pick_s2[0];
                    draft.currentPlayer = getPlayer(next.p);
                    draft.actionCount = next.c;
                } else {
                    draft.phase = "complete";
                    draft.action = "complete";
                    draft.currentPlayer = "";
                }
            }
            break;
        case "pick_s2":
            resetHover();
            if (draft.step < logic.pick_s2.length - 1) {
                draft.step++;
                const next = logic.pick_s2[draft.step];
                draft.currentPlayer = getPlayer(next.p);
                draft.actionCount = next.c;
            } else {
                draft.phase = "complete";
                draft.action = "complete";
                draft.currentPlayer = "";
            }
            break;
    }
    return lobby;
}

function handleIdSelection(lobby, player, id) {
    if (lobby.participants[player].ready) return { error: "Player is locked in." };
    const currentRoster = lobby.roster[player];
    const index = currentRoster.indexOf(id);
    if (index === -1) {
        if (currentRoster.length < config.ROSTER_SIZE) {
            currentRoster.push(id);
        }
    } else {
        currentRoster.splice(index, 1);
    }
    return { lobby };
}

function handleDraftAction(lobby, actingPlayer, selectedId) {
    const { draft } = lobby;
    const { currentPlayer, phase } = draft;

    if (actingPlayer !== currentPlayer && actingPlayer !== 'ref') {
        return { error: "Not your turn to act." };
    }
    if (!selectedId) {
        return { error: "No ID or EGO selected." };
    }

    if (phase === 'egoBan') {
        const playerBans = draft.egoBans[currentPlayer];
        if (playerBans.length >= config.EGO_BAN_COUNT) {
            return { error: `Maximum of ${config.EGO_BAN_COUNT} EGO bans reached.` };
        }
        if (!playerBans.includes(selectedId)) {
            playerBans.push(selectedId);
        }
    } else if (['ban', 'pick', 'midBan', 'pick2', 'pick_s2'].includes(phase)) {
        if (draft.actionCount <= 0) {
            return { error: "No actions left for this turn." };
        }

        const isBanAction = (phase === 'ban' || phase === 'midBan');
        const listToUpdate = isBanAction ? draft.idBans[currentPlayer] : 
                             (phase === 'pick_s2' ? draft.picks_s2[currentPlayer] : draft.picks[currentPlayer]);
        
        listToUpdate.push(selectedId);

        // Remove from both players' available pools
        let p1Index = draft.available.p1.indexOf(selectedId);
        if (p1Index > -1) draft.available.p1.splice(p1Index, 1);
        let p2Index = draft.available.p2.indexOf(selectedId);
        if (p2Index > -1) draft.available.p2.splice(p2Index, 1);

        draft.actionCount--;
        if (draft.actionCount <= 0) {
            advancePhase(lobby);
        }
    }

    draft.hovered[currentPlayer] = null;
    return { lobby };
}


module.exports = {
    advancePhase,
    handleIdSelection,
    handleDraftAction
};
