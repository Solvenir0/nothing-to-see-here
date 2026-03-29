// client/js/rendering/rosterPhase.js
// Roster selection phase and EGO ban phase rendering, plus role-selection modal.
// Call init(sendMessage) before the app goes live.

import { zayinBanExceptions } from '../config.js';
import { state, elements } from '../state.js';
import { createEgoElement, getEgoDisplayName } from './egoElements.js';
import { renderIDList, renderGroupedView, filterIDs } from './idElements.js';

let _sendMessage = null;

export function init(sendMessage) {
    _sendMessage = sendMessage;
}

export function filterAndRenderRosterSelection() {
    const filteredList = filterIDs(state.masterIDList, state.filters);

    ['p1', 'p2'].forEach(player => {
        const container = elements[`${player}Roster`];
        const scrollTop = container.scrollTop;
        renderIDList(container, filteredList, {
            selectionSet: state.roster[player],
            clickHandler: (id) => _sendMessage({ type: 'rosterSelect', lobbyCode: state.lobbyCode, player, id })
        });
        container.scrollTop = scrollTop;
    });
}

export function renderEgoBanPhase() {
    const { currentPlayer, hovered, egoBans, step } = state.draft;
    const opponent = currentPlayer === 'p1' ? 'p2' : 'p1';
    const totalEgoBansPerPlayer = (state.draft.egoBanSteps || 10) / 2;

    elements.egoBanTitle.textContent = `EGO Ban Phase - ${state.participants[currentPlayer].name}'s Turn (Ban ${Math.floor(step / 2) + 1} of ${totalEgoBansPerPlayer})`;

    const clickHandler = (state.userRole === currentPlayer || state.userRole === 'ref')
        ? (egoId) => _sendMessage({ type: 'draftHover', lobbyCode: state.lobbyCode, payload: { id: egoId, type: 'ego' } })
        : null;

    const searchTerm = state.egoSearch.toLowerCase();
    const allBans = [...egoBans.p1, ...egoBans.p2];

    const availableEgos = state.masterEGOList.filter(ego => {
        if (allBans.includes(ego.id)) return false;
        const isZayin = ego.rarity === 'ZAYIN';
        const isException = zayinBanExceptions.includes(ego.name);
        return !isZayin || isException;
    });

    const filteredEgos = availableEgos.filter(ego =>
        ego.name.toLowerCase().includes(searchTerm) ||
        ego.sinner.toLowerCase().includes(searchTerm)
    );

    const container = elements.egoBanContainer;
    const scrollTop = container.scrollTop;
    container.innerHTML = '';
    const fragment = document.createDocumentFragment();
    filteredEgos.forEach(ego => {
        fragment.appendChild(createEgoElement(ego, {
            clickHandler,
            isHovered: hovered[currentPlayer] === ego.id
        }));
    });
    container.appendChild(fragment);
    container.scrollTop = scrollTop;

    const currentPlayerBans = egoBans[currentPlayer] || [];
    const bansContainer = elements.currentPlayerEgoBans;
    bansContainer.innerHTML = '';
    const bannedEgoObjects = currentPlayerBans.map(id => state.masterEGOList.find(ego => ego.id === id)).filter(Boolean);

    bannedEgoObjects.forEach(ego => {
        const item = document.createElement('div');
        item.className = 'banned-ego-item';
        item.style.borderLeft = `3px solid ${ego.cssColor}`;
        const displayName = getEgoDisplayName(ego);
        item.innerHTML = `<span class="rarity">[${ego.rarity}]</span> <span class="name" style="text-decoration: none;">${displayName}</span>`;
        bansContainer.appendChild(item);
    });

    const yourBansHeader = elements.egoBanPlayerBansSection.querySelector('h3');
    if (yourBansHeader) {
        yourBansHeader.innerHTML = `Your Bans (<span id="ego-ban-counter">${currentPlayerBans.length}</span>/${totalEgoBansPerPlayer})`;
    }

    elements.opponentRosterTitle.textContent = `${state.participants[opponent].name}'s Roster`;
    const opponentRosterObjects = state.roster[opponent].map(id => state.masterIDList.find(item => item.id === id)).filter(Boolean);
    renderGroupedView(elements.opponentRosterList, opponentRosterObjects, {});

    elements.confirmEgoBans.classList.add('hidden');
    elements.confirmSelectionEgo.disabled = !hovered[currentPlayer];

    const allBansPreview = elements.p1EgoBansPreview;
    if (allBans.length > 0) {
        allBansPreview.classList.remove('hidden');
        allBansPreview.querySelector('h3').textContent = 'Banned EGOs';
        const allBannedObjects = allBans.map(id => state.masterEGOList.find(e => e.id === id)).filter(Boolean);
        const listEl = allBansPreview.querySelector('.banned-egos-list');
        listEl.innerHTML = '';
        allBannedObjects.forEach(ego => {
            const item = document.createElement('div');
            item.className = 'banned-ego-item';
            item.style.backgroundColor = ego.cssColor;
            const displayName = getEgoDisplayName(ego);
            item.innerHTML = `<span class="rarity">[${ego.rarity}]</span> <span class="name">${displayName}</span>`;
            listEl.appendChild(item);
        });
    } else {
        allBansPreview.classList.add('hidden');
    }
}

export function showRoleSelectionModal(lobby) {
    state.joinTarget.lobbyCode = lobby.code;
    elements.roleModalLobbyCode.textContent = lobby.code;

    const roleOptionsContainer = elements.modalRoleOptions;
    roleOptionsContainer.innerHTML = '';

    const roles = {
        p1: { icon: 'fa-user', text: 'Player 1' },
        p2: { icon: 'fa-user', text: 'Player 2' },
        ref: { icon: 'fa-star', text: 'Referee' }
    };

    Object.entries(roles).forEach(([role, details]) => {
        const isTaken = lobby.participants[role].status === 'connected';
        const option = document.createElement('div');
        option.className = 'role-option';
        option.dataset.role = role;
        option.innerHTML = `<i class="fas ${details.icon}"></i><div>${details.text}</div>`;
        if (isTaken) {
            option.classList.add('disabled');
        } else {
            option.addEventListener('click', () => {
                roleOptionsContainer.querySelectorAll('.role-option').forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');
                state.joinTarget.role = role;
                elements.confirmJoinBtn.disabled = false;
            });
        }
        roleOptionsContainer.appendChild(option);
    });

    elements.roleSelectionModal.classList.remove('hidden');
}

export function createFilterBarHTML(options = {}) {
    const { showSinnerFilter = true } = options;
    const sinnerFilterHTML = `
        <div class="filter-group">
            <label class="filter-label">Filter by Sinner:</label>
            <select class="sinner-filter" data-filter="sinner">
                <option value="">All Sinners</option>
                <option value="Yi Sang">Yi Sang</option><option value="Faust">Faust</option><option value="Don Quixote">Don Quixote</option>
                <option value="Ryōshū">Ryōshū</option><option value="Meursault">Meursault</option><option value="Hong Lu">Hong Lu</option>
                <option value="Heathcliff">Heathcliff</option><option value="Ishmael">Ishmael</option><option value="Rodion">Rodion</option>
                <option value="Sinclair">Sinclair</option><option value="Outis">Outis</option><option value="Gregor">Gregor</option>
            </select>
        </div>
    `;

    return `
        <div class="filter-group">
            <label class="filter-label">Search by Name:</label>
            <input type="text" class="roster-search-input" placeholder="e.g. LCB Sinner...">
        </div>
        ${showSinnerFilter ? sinnerFilterHTML : ''}
        <div class="filter-group">
            <label class="filter-label">Filter by Sin Affinity:</label>
            <select class="sinAffinity-filter" data-filter="sinAffinity">
                <option value="">All Affinities</option>
                <option value="Gloom">Gloom</option><option value="Lust">Lust</option><option value="Sloth">Sloth</option>
                <option value="Wrath">Wrath</option><option value="Gluttony">Gluttony</option><option value="Envy">Envy</option><option value="Pride">Pride</option>
            </select>
        </div>
        <div class="filter-group">
            <label class="filter-label">Filter by Keyword:</label>
            <select class="keyword-filter" data-filter="keyword">
                <option value="">All Keywords</option>
                <option value="Sinking">Sinking</option><option value="Rupture">Rupture</option><option value="Discard">Discard</option>
                <option value="Tremor">Tremor</option><option value="Bleed">Bleed</option><option value="Poise">Poise</option>
                <option value="Aggro">Aggro</option><option value="Charge">Charge</option><option value="Burn">Burn</option><option value="Ammo">Ammo</option>
            </select>
        </div>
        <div class="filter-buttons">
            <button class="btn reset-filters-btn"><i class="fas fa-sync"></i> Reset</button>
        </div>
    `;
}
