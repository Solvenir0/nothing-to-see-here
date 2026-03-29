// client/js/rendering/navigation.js
// View switching and top-level UI state refresh.

import { state, elements } from '../state.js';
import { getReserveTimeElement } from '../utils/core.js';
import { filterAndRenderRosterSelection, renderEgoBanPhase } from './rosterPhase.js';
import { updateDraftUI, updateDraftInstructions, displayCoinFlipResultAndChoices, updateTimerUI } from './draftPhase.js';
import { renderCompletedView } from './completedView.js';

export function switchView(view) {
    console.log('Switching to view:', view);
    state.currentView = view;

    ['mainPage', 'lobbyView', 'completedView', 'rosterBuilderPage', 'analyzerPage', 'timelineWrapper'].forEach(pageId => {
        const el = elements[pageId];
        if (el) {
            el.classList.add('hidden');
            el.style.display = '';
        } else {
            console.warn('Element not found for hiding:', pageId);
        }
    });

    const targetEl = elements[view];
    if (targetEl) {
        targetEl.classList.remove('hidden');
        targetEl.style.display = 'block';
        console.log('Successfully switched to:', view);
    } else {
        console.error('Target view element not found for showing:', view);
    }

    elements.globalBackToMain.classList.toggle('hidden', view === 'mainPage');
}

export function refreshInterfaceBasedOnGameState() {
    const { draft } = state;
    const { phase, rosterSize } = draft;

    if (phase === 'complete') {
        switchView('completedView');
        renderCompletedView();
        return;
    } else if (state.lobbyCode) {
        switchView('lobbyView');
    } else if (state.currentView !== 'rosterBuilderPage') {
        switchView('mainPage');
    }

    elements.rosterPhase.classList.toggle('hidden', phase !== 'roster');
    elements.egoBanPhase.classList.toggle('hidden', phase !== 'egoBan');
    elements.idDraftPhase.classList.toggle('hidden', !['ban', 'pick', 'midBan', 'pick2', 'pick_s2'].includes(phase));
    elements.coinFlipModal.classList.toggle('hidden', phase !== 'coinFlip');
    elements.draftStatusPanel.classList.toggle('hidden', phase === 'roster' || phase === 'complete');

    document.body.classList.remove('draft-ban-phase', 'draft-pick-phase');
    if (['ban', 'midBan', 'egoBan'].includes(phase)) {
        document.body.classList.add('draft-ban-phase');
        console.log('Applied draft-ban-phase class for phase:', phase);
    } else if (['pick', 'pick2', 'pick_s2'].includes(phase)) {
        document.body.classList.add('draft-pick-phase');
        console.log('Applied draft-pick-phase class for phase:', phase);
    }

    if (phase === 'coinFlip') {
        displayCoinFlipResultAndChoices();
    }

    elements.participantsList.innerHTML = '';
    ['p1', 'p2', 'ref'].forEach(role => {
        const p = state.participants[role];
        const displayName = state.userRole === role ? `${p.name} (You)` : p.name;
        const el = document.createElement('div');
        el.className = `participant ${state.userRole === role ? 'current-user' : ''}`;
        const icon = role === 'ref' ? 'fa-star' : 'fa-user';
        let statusIcon = '<i class="fas fa-times-circle" style="color:var(--disconnected);"></i>';
        if (p.status === 'connected') {
            statusIcon = (role !== 'ref' && p.ready)
                ? ` <i class="fas fa-check-circle" style="color:var(--ready);"></i>`
                : ` <i class="fas fa-dot-circle" style="color:var(--connected);"></i>`;
        }
        el.innerHTML = `<i class="fas ${icon}"></i> ${displayName} ${statusIcon}`;
        elements.participantsList.appendChild(el);

        if ((role === 'p1' || role === 'p2') && p.reserveTime !== undefined) {
            const reserveTimeEl = getReserveTimeElement(role);
            if (reserveTimeEl) {
                const minutes = Math.floor(p.reserveTime / 60);
                const seconds = p.reserveTime % 60;
                reserveTimeEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            }
        }
    });

    ['p1', 'p2'].forEach(player => {
        const isReady = state.participants[player].ready;
        elements[`${player}NameDisplay`].textContent = state.participants[player].name;
        elements[`${player}Counter`].textContent = state.roster[player].length;
        elements[`${player}RosterSize`].textContent = rosterSize;
        elements[`${player}Ready`].innerHTML = isReady ? '<i class="fas fa-times"></i> Unready' : `<i class="fas fa-check"></i> Ready`;
        elements[`${player}Ready`].classList.toggle('btn-ready', isReady);
        elements[`${player}Status`].textContent = isReady ? 'Ready' : 'Selecting';
        elements[`${player}Status`].className = `player-status ${isReady ? 'status-ready' : 'status-waiting'}`;
        elements[`${player}Panel`].classList.toggle('locked', isReady);
        elements[`${player}Random`].disabled = isReady;
        elements[`${player}Clear`].disabled = isReady;
    });

    if (phase === 'roster') {
        elements.rosterPhaseTitle.textContent = `Roster Selection Phase (${rosterSize} IDs)`;
        filterAndRenderRosterSelection();
    } else if (phase === 'egoBan') {
        renderEgoBanPhase();
    } else if (['ban', 'pick', 'midBan', 'pick2', 'pick_s2'].includes(phase)) {
        updateDraftUI();
    }

    updateDraftInstructions();
    updateRosterPhaseReadyButtonState();
    updateTimerUI();
}

export function updateRosterPhaseReadyButtonState() {
    if (state.draft.phase === 'roster') {
        const { rosterSize } = state.draft;
        const p1Ready = state.participants.p1.ready && state.roster.p1.length === rosterSize;
        const p2Ready = state.participants.p2.ready && state.roster.p2.length === rosterSize;
        if (state.userRole === 'ref') {
            elements.startCoinFlip.disabled = !(p1Ready && p2Ready);
        }
    }
}
