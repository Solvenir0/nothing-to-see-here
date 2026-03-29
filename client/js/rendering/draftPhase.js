// client/js/rendering/draftPhase.js
// Draft-phase UI: pool rendering, instructions, timer, coin flip.
// Call init(sendMessage) before the app goes live.

import { TIMING } from '../config.js';
import { state, elements } from '../state.js';
import { renderGroupedView, renderIDList, filterIDs } from './idElements.js';
import { renderBannedEgosDisplay } from './egoElements.js';
import { playCountdownSound, playTurnNotificationSound } from './sound.js';

let _sendMessage = null;

export function init(sendMessage) {
    _sendMessage = sendMessage;
}

// Module-level state for turn-change detection
let isUpdatingDraftInstructions = false;
let previousPhase = null;
let previousCurrentPlayer = null;

export function updateDraftUI() {
    const userRole = state.userRole;
    const p1Name = state.participants.p1.name;
    const p2Name = state.participants.p2.name;

    if (userRole === 'p1') {
        elements.p1DraftName.innerHTML = `${p1Name} <i class="fas fa-star your-side-indicator" title="Your Side"></i>`;
        elements.p2DraftName.textContent = p2Name;
    } else if (userRole === 'p2') {
        elements.p1DraftName.textContent = p1Name;
        elements.p2DraftName.innerHTML = `${p2Name} <i class="fas fa-star your-side-indicator" title="Your Side"></i>`;
    } else {
        elements.p1DraftName.textContent = p1Name;
        elements.p2DraftName.textContent = p2Name;
    }

    const renderCompactIdListChronological = (container, idList) => {
        const scrollTop = container.scrollTop;
        const idObjects = idList.map(id => state.masterIDList.find(item => item.id === id)).filter(Boolean);
        renderIDList(container, idObjects, {});
        container.scrollTop = scrollTop;
    };

    renderCompactIdListChronological(elements.p1IdBans, [...state.draft.idBans.p1].reverse());
    renderCompactIdListChronological(elements.p2IdBans, [...state.draft.idBans.p2].reverse());
    renderCompactIdListChronological(elements.p1Picks, [...state.draft.picks.p1].reverse());
    renderCompactIdListChronological(elements.p2Picks, [...state.draft.picks.p2].reverse());

    const isAllSections = state.draft.matchType === 'allSections';
    elements.p1S2PicksContainer.classList.toggle('hidden', !isAllSections);
    elements.p2S2PicksContainer.classList.toggle('hidden', !isAllSections);
    if (isAllSections) {
        elements.p1S2Picks.innerHTML = '';
        elements.p2S2Picks.innerHTML = '';
    } else {
        renderCompactIdListChronological(elements.p1S2Picks, [...state.draft.picks_s2.p1].reverse());
        renderCompactIdListChronological(elements.p2S2Picks, [...state.draft.picks_s2.p2].reverse());
    }

    const { currentPlayer } = state.draft;
    elements.p1DraftStatus.textContent = currentPlayer === 'p1' ? 'Drafting' : 'Waiting';
    elements.p2DraftStatus.textContent = currentPlayer === 'p2' ? 'Drafting' : 'Waiting';
    elements.p1DraftStatus.className = `player-status ${currentPlayer === 'p1' ? 'status-drafting' : 'status-waiting'}`;
    elements.p2DraftStatus.className = `player-status ${currentPlayer === 'p2' ? 'status-drafting' : 'status-waiting'}`;

    elements.p1DraftColumn.classList.toggle('draft-active', currentPlayer === 'p1');
    elements.p2DraftColumn.classList.toggle('draft-active', currentPlayer === 'p2');
    elements.draftInteractionHub.classList.toggle('draft-active', !!currentPlayer);

    renderBannedEgosDisplay();
}

export function updateDraftInstructions() {
    if (isUpdatingDraftInstructions) return;
    isUpdatingDraftInstructions = true;

    try {
        let phaseText = '', actionDesc = '';
        const { phase, currentPlayer, action, actionCount, egoBans, hovered, matchType } = state.draft;

        const isPlayerTurn = (state.userRole === currentPlayer);
        const isActionPhase = ['egoBan', 'ban', 'pick', 'midBan', 'pick2', 'pick_s2'].includes(phase);
        const isTurnChange = (phase !== previousPhase) || (currentPlayer !== previousCurrentPlayer);

        if (isPlayerTurn && isActionPhase && isTurnChange && previousPhase !== null) {
            playTurnNotificationSound(phase);
        }

        previousPhase = phase;
        previousCurrentPlayer = currentPlayer;

        const hub = elements.draftInteractionHub;
        const existingPool = hub.querySelector('.sinner-grouped-roster');
        const existingScrollTop = existingPool ? existingPool.scrollTop : 0;

        elements.draftPoolContainer.innerHTML = '';

        switch (phase) {
            case 'roster':
                phaseText = 'Roster Selection';
                actionDesc = `Select ${state.draft.rosterSize} IDs for your roster, then ready up`;
                break;
            case 'coinFlip':
                phaseText = 'Coin Flip';
                actionDesc = 'Winner chooses turn order';
                break;
            case 'egoBan': {
                const totalEgoBansPerPlayer = (state.draft.egoBanSteps || 10) / 2;
                const bansDoneByCurrentPlayer = egoBans[currentPlayer] ? egoBans[currentPlayer].length : 0;
                phaseText = `EGO Ban Phase - ${state.participants[currentPlayer].name}'s Turn`;
                actionDesc = `Ban 1 EGO (${bansDoneByCurrentPlayer}/${totalEgoBansPerPlayer} bans)`;
                break;
            }
            case 'ban': {
                phaseText = `ID Ban Phase - ${state.participants[currentPlayer].name}'s Turn`;
                const totalBans = 6;
                const currentBans = (state.draft.idBans[currentPlayer] || []).length;
                actionDesc = `Ban ${actionCount} IDs (${currentBans}/${totalBans} bans)`;
                break;
            }
            case 'pick': {
                phaseText = `ID Pick Phase 1 - ${state.participants[currentPlayer].name}'s Turn`;
                const totalPicks1 = 6;
                const currentPicks1 = (state.draft.picks[currentPlayer] || []).length;
                actionDesc = `Pick ${actionCount} IDs (${currentPicks1}/${totalPicks1} picks)`;
                break;
            }
            case 'midBan': {
                phaseText = `Mid-Draft Ban Phase - ${state.participants[currentPlayer].name}'s Turn`;
                const midBanCount = matchType === 'allSections' ? 4 : 3;
                const currentMidBans = (state.draft.idBans[currentPlayer] || []).length - 6;
                actionDesc = `Ban ${actionCount} IDs (${Math.max(0, currentMidBans)}/${midBanCount} mid-bans)`;
                break;
            }
            case 'pick2': {
                phaseText = `ID Pick Phase 2 - ${state.participants[currentPlayer].name}'s Turn`;
                const totalPicks2 = matchType === 'allSections' ? 12 : 6;
                const currentPicks2 = (state.draft.picks[currentPlayer] || []).length - 6;
                actionDesc = `Pick ${actionCount} IDs (${Math.max(0, currentPicks2)}/${totalPicks2} picks)`;
                break;
            }
            case 'pick_s2': {
                phaseText = `Section 2/3 Pick Phase - ${state.participants[currentPlayer].name}'s Turn`;
                const totalS2Picks = 6;
                const currentS2Picks = (state.draft.picks_s2[currentPlayer] || []).length;
                actionDesc = `Pick ${actionCount} Section 2/3 IDs (${currentS2Picks}/${totalS2Picks} picks)`;
                break;
            }
            case 'complete':
                phaseText = 'Draft Complete';
                actionDesc = 'All selections finalized';
                break;
            default:
                phaseText = 'Waiting for Draft to Start';
                actionDesc = 'Waiting for referee to start';
        }

        if (['ban', 'pick', 'midBan', 'pick2', 'pick_s2'].includes(phase)) {
            const isBanAction = (phase === 'ban' || phase === 'midBan');

            let availableIdList;
            if (isBanAction) {
                const enemyPlayer = currentPlayer === 'p1' ? 'p2' : 'p1';
                const enemyRoster = state.roster[enemyPlayer] || [];
                const blocked = new Set([
                    ...state.draft.idBans.p1, ...state.draft.idBans.p2,
                    ...state.draft.picks.p1, ...state.draft.picks.p2,
                    ...state.draft.picks_s2.p1, ...state.draft.picks_s2.p2
                ]);
                availableIdList = enemyRoster.filter(id => !blocked.has(id));
            } else {
                const available = state.draft.available || {};
                availableIdList = [...(available[currentPlayer] || [])];
            }

            if (!availableIdList) {
                console.error('[Draft Render] ERROR: availableIdList for draft pool render');
                return;
            }

            let availableObjects = availableIdList.map(id => state.masterIDList.find(item => item && item.id === id)).filter(Boolean);
            availableObjects = filterIDs(availableObjects, state.draftFilters, { draftPhase: true });

            const clickHandler = (state.userRole === currentPlayer || state.userRole === 'ref')
                ? (id) => _sendMessage({ type: 'draftHover', lobbyCode: state.lobbyCode, payload: { id, type: 'id' } })
                : null;

            const poolEl = document.createElement('div');
            poolEl.className = 'sinner-grouped-roster';
            poolEl.style.maxHeight = '60vh';
            elements.draftPoolContainer.appendChild(poolEl);

            const sharedIds = state.roster.p1.filter(id => state.roster.p2.includes(id));
            renderGroupedView(poolEl, availableObjects, {
                clickHandler,
                hoverId: hovered[currentPlayer],
                selectionSet: hovered[currentPlayer] ? [hovered[currentPlayer]] : [],
                sharedIdSet: sharedIds
            });

            poolEl.scrollTop = existingScrollTop;

            elements.confirmSelectionId.disabled = !hovered[currentPlayer] || state.draft.actionCount <= 0;
        }

        elements.currentPhase.textContent = phaseText;
        elements.draftActionDescription.textContent = actionDesc;
        elements.completeDraft.disabled = state.userRole !== 'ref' || phase === 'complete';
    } finally {
        isUpdatingDraftInstructions = false;
    }
}

export function displayCoinFlipResultAndChoices() {
    const { coinFlipWinner } = state.draft;
    const winnerName = coinFlipWinner ? state.participants[coinFlipWinner].name : '';

    if (!coinFlipWinner) {
        elements.coinIcon.classList.add('flipping');
        elements.coinFlipStatus.textContent = 'Flipping coin...';
        elements.turnChoiceButtons.classList.add('hidden');
    } else {
        elements.coinIcon.classList.remove('flipping');
        elements.coinFlipStatus.textContent = `${winnerName} wins! Choose turn order`;

        const canChoose = state.userRole === coinFlipWinner || state.userRole === 'ref';
        if (canChoose) {
            elements.turnChoiceButtons.classList.remove('hidden');
            if (state.userRole === 'ref' && state.userRole !== coinFlipWinner) {
                elements.coinFlipStatus.innerHTML = `${winnerName} wins! Choose turn order<br><small>Waiting for them to choose (or you can choose for them).</small>`;
            }
        } else {
            elements.turnChoiceButtons.classList.add('hidden');
            elements.coinFlipStatus.textContent = `${winnerName} wins! Waiting for choice...`;
        }
    }
}

export function updateTimerUI() {
    const { timer, currentPlayer } = state.draft;
    elements.refTimerControl.classList.toggle('hidden', !timer.enabled || state.userRole !== 'ref');
    elements.phaseTimer.classList.toggle('hidden', !timer.enabled);
    elements.phaseTimer.classList.toggle('reserve-active', timer.isReserve);

    if (!timer.enabled || !timer.running) {
        elements.phaseTimer.textContent = '--:--';
        if (state.timerInterval) clearInterval(state.timerInterval);
        state.timerInterval = null;
        state.lastCountdownSecond = null;
        return;
    }

    if (!state.timerInterval) {
        state.timerInterval = setInterval(updateTimerUI, TIMING.TIMER_UPDATE_INTERVAL);
    }

    const remaining = Math.max(0, Math.round((timer.endTime - Date.now()) / 1000));
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    elements.phaseTimer.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    const isCurrentPlayersTurn = state.userRole === currentPlayer;
    if (isCurrentPlayersTurn && remaining <= 5 && remaining > 0) {
        playCountdownSound(remaining);
    }
}
