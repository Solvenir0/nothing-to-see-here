// client/js/rendering/completedView.js
// Completed draft view and timeline rendering.

import { SINNER_ORDER } from '../config.js';
import { state, elements } from '../state.js';
import { createIdElement, renderIDList, sortIdsByMasterList } from './idElements.js';
import { renderBannedEgosDisplay, getEgoDisplayName } from './egoElements.js';

export function renderCompletedView() {
    const renderChronologicalIdList = (container, idList) => {
        container.innerHTML = '';
        const idObjects = idList.map(id => state.masterIDList.find(item => item.id === id)).filter(Boolean);
        const fragment = document.createDocumentFragment();
        idObjects.forEach(idData => {
            fragment.appendChild(createIdElement(idData, {}));
        });
        container.appendChild(fragment);
    };

    elements.finalP1Name.textContent = `${state.participants.p1.name}'s Roster`;
    elements.finalP2Name.textContent = `${state.participants.p2.name}'s Roster`;

    renderChronologicalIdList(elements.finalP1Picks, state.draft.picks.p1);
    renderChronologicalIdList(elements.finalP2Picks, state.draft.picks.p2);

    const isAllSections = state.draft.matchType === 'allSections';
    const showS2Container = !isAllSections && (state.draft.picks_s2.p1.length > 0 || state.draft.picks_s2.p2.length > 0);

    elements.finalP1S2PicksContainer.classList.toggle('hidden', !showS2Container);
    elements.finalP2S2PicksContainer.classList.toggle('hidden', !showS2Container);
    if (showS2Container) {
        renderChronologicalIdList(elements.finalP1S2Picks, state.draft.picks_s2.p1);
        renderChronologicalIdList(elements.finalP2S2Picks, state.draft.picks_s2.p2);
    }

    renderChronologicalIdList(elements.finalP1Bans, state.draft.idBans.p1);
    renderChronologicalIdList(elements.finalP2Bans, state.draft.idBans.p2);

    renderBannedEgosDisplay();
    renderTimelineView();
}

export function renderTimelineView() {
    const { draft, participants, roster } = state;

    const unavailableIds = new Set([
        ...draft.idBans.p1, ...draft.idBans.p2,
        ...draft.picks.p1, ...draft.picks.p2,
        ...draft.picks_s2.p1, ...draft.picks_s2.p2
    ]);

    const renderRoster = (player, container, nameEl) => {
        nameEl.textContent = `${participants[player].name}'s Roster`;
        container.innerHTML = '';
        const fragment = document.createDocumentFragment();
        const sortedRoster = sortIdsByMasterList(roster[player]);
        const idObjects = sortedRoster.map(id => state.masterIDList.find(item => item.id === id)).filter(Boolean);
        idObjects.forEach(idData => {
            const element = createIdElement(idData, {});
            if (unavailableIds.has(idData.id)) element.classList.add('unavailable');
            fragment.appendChild(element);
        });
        container.appendChild(fragment);
    };

    renderRoster('p1', elements.timelineRosterP1, elements.timelineRosterP1Name);
    renderRoster('p2', elements.timelineRosterP2, elements.timelineRosterP2Name);

    const container = elements.timelineView;
    container.innerHTML = '';
    const { history } = state.draft;

    if (!history || history.length === 0) {
        container.innerHTML = '<p>No draft history available.</p>';
        return;
    }

    // Group consecutive actions by same player and type
    const groupedHistory = [];
    if (history.length > 0) {
        let currentGroup = { player: history[0].player, type: history[0].type, events: [history[0]] };
        for (let i = 1; i < history.length; i++) {
            const event = history[i];
            if (event.player === currentGroup.player && event.type === currentGroup.type) {
                currentGroup.events.push(event);
            } else {
                groupedHistory.push(currentGroup);
                currentGroup = { player: event.player, type: event.type, events: [event] };
            }
        }
        groupedHistory.push(currentGroup);
    }

    const timelineContainer = document.createElement('div');
    timelineContainer.className = 'timeline-container';

    groupedHistory.forEach(group => {
        const { player, type, events } = group;
        const isBan = type.includes('BAN');

        const eventElement = document.createElement('div');
        eventElement.className = `timeline-event ${player}`;

        const card = document.createElement('div');
        card.className = `event-card ${isBan ? 'ban' : 'pick'}`;

        const actionText = type.replace('_', ' ');
        const countText = events.length > 1 ? ` (x${events.length})` : '';

        const eventsContainer = document.createElement('div');
        eventsContainer.className = 'event-group-container';

        events.forEach(event => {
            const { targetId } = event;
            let targetData = isBan && type.includes('EGO')
                ? state.masterEGOList.find(e => e.id === targetId)
                : state.masterIDList.find(i => i.id === targetId);

            if (!targetData) return;

            const eventBody = document.createElement('div');
            eventBody.className = 'event-body';

            if (isBan && type.includes('EGO')) {
                const icon = document.createElement('i');
                icon.className = 'fas fa-shield-alt fa-2x';
                icon.style.width = '60px';
                icon.style.textAlign = 'center';
                eventBody.appendChild(icon);
            } else {
                const img = document.createElement('img');
                img.src = `/uploads/${targetData.imageFile}`;
                img.alt = targetData.name;
                eventBody.appendChild(img);
            }
            const nameSpan = document.createElement('span');
            nameSpan.className = 'target-name';
            nameSpan.textContent = targetData.name;
            eventBody.appendChild(nameSpan);
            eventsContainer.appendChild(eventBody);
        });

        const headerDiv = document.createElement('div');
        headerDiv.className = 'event-header';
        const playerNameSpan = document.createElement('span');
        playerNameSpan.className = 'player-name';
        playerNameSpan.textContent = state.participants[player].name;
        const actionTypeSpan = document.createElement('span');
        actionTypeSpan.className = 'action-type';
        actionTypeSpan.textContent = `${actionText}${countText}`;
        headerDiv.appendChild(playerNameSpan);
        headerDiv.appendChild(actionTypeSpan);
        card.appendChild(headerDiv);
        card.appendChild(eventsContainer);
        eventElement.appendChild(card);
        timelineContainer.appendChild(eventElement);
    });

    container.appendChild(timelineContainer);
}
