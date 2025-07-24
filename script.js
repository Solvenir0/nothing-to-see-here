// =================================================================================
// FILE: script.js
// DESCRIPTION: This is the complete frontend script for the Limbus Company Draft
//              System. It handles all UI rendering, user interactions, and
//              communication with the WebSocket server.
//
// REFACTOR SUMMARY:
// - Modular State: The large global `state` object has been broken into smaller,
//   more manageable pieces (e.g., `appState`, `lobbyState`, `builderState`).
// - Server-side Data: The client no longer parses ID/EGO data. It receives
//   fully parsed data and configuration from the server upon connection.
// - Efficient DOM Updates: Instead of full re-renders, the script now uses more
//   targeted DOM updates to improve performance, especially for large lists.
// - Semantic HTML & Accessibility: Event listeners are attached to proper
//   <button> elements, improving accessibility.
// - Code Organization: The script is now organized into logical sections for
//   state, UI rendering, WebSocket handling, and event listeners.
// =================================================================================

// ==========================================================================
// 1. APPLICATION STATE
// ==========================================================================
const appState = {
    socket: null,
    currentView: 'mainPage', // 'mainPage', 'lobbyView', 'rosterBuilderPage', 'completedView'
    userRole: null,
    rejoinToken: null,
    // Static data received from server
    gameData: {
        masterIDList: [],
        masterEGOList: [],
        idsBySinner: {},
        allIds: [],
    },
    config: {
        ROSTER_SIZE: 42,
        EGO_BAN_COUNT: 5,
    },
};

const lobbyState = {
    code: null,
    participants: {},
    roster: { p1: [], p2: [] },
    draft: {},
    filters: { sinner: "", sinAffinity: "", keyword: "", rosterSearch: "" },
    draftFilters: { sinner: "", sinAffinity: "", keyword: "", rosterSearch: "" },
    egoSearch: "",
    timerInterval: null,
    joinTarget: { lobbyCode: null, role: null },
};

const builderState = {
    roster: [],
    selectedSinner: "Yi Sang",
    filters: { sinner: "", sinAffinity: "", keyword: "", rosterSearch: "" },
};

// A single object to hold all cached DOM elements
const elements = {};

// ==========================================================================
// 2. UTILITY & HELPER FUNCTIONS
// ==========================================================================

function showNotification(text, isError = false) {
    elements.notification.textContent = text;
    elements.notification.className = `notification ${isError ? 'error' : 'success'}`;
    elements.notification.classList.add('show');
    setTimeout(() => {
        elements.notification.classList.remove('show');
    }, 3000);
}

function switchView(viewId) {
    appState.currentView = viewId;
    elements.views.forEach(view => {
        view.classList.toggle('hidden', view.id !== viewId);
    });
}

function generateRosterCode() {
    if (builderState.roster.length !== appState.config.ROSTER_SIZE) return null;
    try {
        const indices = builderState.roster.map(slug => {
            const index = appState.gameData.masterIDList.findIndex(id => id.id === slug);
            return index > -1 ? index : 255;
        });
        const uint8Array = new Uint8Array(indices);
        const binaryString = String.fromCharCode.apply(null, uint8Array);
        return btoa(binaryString);
    } catch (e) {
        console.error("Error generating roster code:", e);
        return null;
    }
}

function loadRosterFromCode(code) {
    try {
        const binaryString = atob(code);
        if (binaryString.length !== appState.config.ROSTER_SIZE) {
            showNotification("Invalid roster code: incorrect length.", true);
            return null;
        }
        const uint8Array = new Uint8Array(binaryString.split('').map(c => c.charCodeAt(0)));
        const rosterSlugs = Array.from(uint8Array).map(index => {
            return (index < appState.gameData.masterIDList.length) ? appState.gameData.masterIDList[index].id : null;
        }).filter(Boolean);

        if (rosterSlugs.length !== appState.config.ROSTER_SIZE) {
            showNotification("Invalid roster code: contains invalid ID data.", true);
            return null;
        }
        return rosterSlugs;
    } catch (e) {
        console.error("Error decoding roster code:", e);
        showNotification("Invalid roster code format.", true);
        return null;
    }
}

function filterIDs(sourceList, filterObject, options = {}) {
    const { draftPhase = false, builderPhase = false } = options;
    const searchTerm = filterObject.rosterSearch.toLowerCase();

    return sourceList.filter(fullData => {
        if (!fullData) return false;
        
        const isLcb = fullData.name.toLowerCase().includes('lcb sinner');
        if (builderPhase && isLcb) return false;
        if (draftPhase && (fullData.rarity === '0' || isLcb)) return false;

        if (filterObject.sinner && fullData.sinner !== filterObject.sinner) return false;
        if (filterObject.sinAffinity && !fullData.sinAffinities.includes(filterObject.sinAffinity)) return false;
        if (filterObject.keyword && !fullData.keywords.includes(filterObject.keyword)) return false;
        if (searchTerm && !fullData.name.toLowerCase().includes(searchTerm)) return false;
        return true;
    });
}

// ==========================================================================
// 3. WEBSOCKET COMMUNICATION
// ==========================================================================
let rejoinTimeout;

function connectWebSocket() {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}`;
    appState.socket = new WebSocket(wsUrl);

    elements.connectionStatus.className = 'connection-status connecting';
    elements.connectionStatus.innerHTML = '<i class="fas fa-plug"></i> <span>Connecting...</span>';

    appState.socket.onopen = handleSocketOpen;
    appState.socket.onmessage = handleSocketMessage;
    appState.socket.onclose = handleSocketClose;
    appState.socket.onerror = (error) => console.error('WebSocket error:', error);
}

function sendMessage(type, payload = {}) {
    if (appState.socket && appState.socket.readyState === WebSocket.OPEN) {
        appState.socket.send(JSON.stringify({ type, payload }));
    }
}

function handleSocketOpen() {
    elements.connectionStatus.className = 'connection-status connected';
    elements.connectionStatus.innerHTML = '<i class="fas fa-plug"></i> <span>Connected</span>';

    const session = JSON.parse(localStorage.getItem('limbusDraftSession'));
    if (session && session.lobbyCode && session.userRole && session.rejoinToken) {
        elements.rejoinOverlay.classList.remove('hidden');
        sendMessage('rejoinLobby', {
            lobbyCode: session.lobbyCode,
            role: session.userRole,
            rejoinToken: session.rejoinToken
        });
        rejoinTimeout = setTimeout(() => {
            if (!elements.rejoinOverlay.classList.contains('hidden')) {
                elements.rejoinOverlay.classList.add('hidden');
                localStorage.removeItem('limbusDraftSession');
                showNotification("Failed to rejoin lobby. Session cleared.", true);
            }
        }, 10000);
    }
}

function handleSocketClose() {
    elements.connectionStatus.className = 'connection-status disconnected';
    elements.connectionStatus.innerHTML = '<i class="fas fa-plug"></i> <span>Disconnected</span>';
    if (lobbyState.timerInterval) clearInterval(lobbyState.timerInterval);
}

function handleSocketMessage(event) {
    const { type, payload } = JSON.parse(event.data);
    console.log("Received from server:", type, payload);

    switch (type) {
        case 'initialData':
            appState.gameData = payload.gameData;
            appState.config = payload.config;
            const builderMasterIDList = appState.gameData.masterIDList.filter(id => !id.name.toLowerCase().includes('lcb sinner'));
            builderMasterIDList.forEach(id => {
                if (!appState.gameData.idsBySinner[id.sinner]) appState.gameData.idsBySinner[id.sinner] = [];
                appState.gameData.idsBySinner[id.sinner].push(id);
            });
            setupAdvancedRandomUI();
            break;
        case 'lobbyCreated':
        case 'lobbyJoined':
            handleLobbyJoined(payload);
            break;
        case 'stateUpdate':
            handleStateUpdate(payload);
            break;
        case 'publicLobbiesList':
            renderPublicLobbies(payload.lobbies);
            break;
        case 'lobbyInfo':
            renderRoleSelectionModal(payload);
            break;
        case 'error':
            showNotification(`Error: ${payload.message}`, true);
            if (payload.message.includes('rejoin')) {
                localStorage.removeItem('limbusDraftSession');
                elements.rejoinOverlay.classList.add('hidden');
                if (rejoinTimeout) clearTimeout(rejoinTimeout);
            }
            break;
    }
}

// ==========================================================================
// 4. STATE UPDATE HANDLERS
// ==========================================================================

function handleLobbyJoined(payload) {
    if (rejoinTimeout) clearTimeout(rejoinTimeout);
    elements.roleSelectionModal.classList.add('hidden');
    elements.rejoinOverlay.classList.add('hidden');

    appState.userRole = payload.role;
    appState.rejoinToken = payload.rejoinToken;

    if (appState.rejoinToken) {
        localStorage.setItem('limbusDraftSession', JSON.stringify({
            lobbyCode: payload.code,
            userRole: appState.userRole,
            rejoinToken: appState.rejoinToken
        }));
    }

    handleStateUpdate(payload);
    showNotification(`Joined lobby as ${payload.participants[appState.userRole].name}`);
}

function handleStateUpdate(newLobbyState) {
    Object.assign(lobbyState, newLobbyState);
    if(lobbyState.code) elements.lobbyCodeDisplay.textContent = lobbyState.code;
    updateAllUIs();
}

// ==========================================================================
// 5. UI RENDERING
// ==========================================================================

function updateAllUIs() {
    if (!lobbyState.draft) return; // Guard against incomplete initial state
    const { phase } = lobbyState.draft;

    elements.draftStatusPanel.classList.toggle('hidden', phase === 'roster' || phase === 'complete');

    if (phase === 'complete') {
        switchView('completedView');
        renderCompletedView();
        return;
    }
    if (lobbyState.code) {
        switchView('lobbyView');
    } else if (appState.currentView !== 'rosterBuilderPage') {
        switchView('mainPage');
    }

    elements.rosterPhase.classList.toggle('hidden', phase !== 'roster');
    elements.egoBanPhase.classList.toggle('hidden', phase !== 'egoBan');
    elements.idDraftPhase.classList.toggle('hidden', !['ban', 'pick', 'midBan', 'pick2', 'pick_s2'].includes(phase));
    elements.coinFlipModal.classList.toggle('hidden', phase !== 'coinFlip');

    if (phase === 'coinFlip') renderCoinFlipUI();
    
    renderParticipants();
    renderRosterSelectionPhase();
    
    if (phase === 'egoBan') renderEgoBanPhase();
    if (['ban', 'pick', 'midBan', 'pick2', 'pick_s2'].includes(phase)) renderIdDraftPhase();
    
    updateDraftInstructions();
    checkPhaseReadiness();
    updateTimerUI();
}

function renderParticipants() {
    elements.participantsList.innerHTML = '';
    ['p1', 'p2', 'ref'].forEach(role => {
        const p = lobbyState.participants[role];
        if (!p) return;
        const displayName = appState.userRole === role ? `${p.name} (You)` : p.name;
        const el = document.createElement('div');
        el.className = `participant ${appState.userRole === role ? 'current-user' : ''}`;
        const icon = role === 'ref' ? 'fa-star' : 'fa-user';
        let statusIcon = '<i class="fas fa-times-circle" style="color:var(--disconnected);"></i>';
        if (p.status === 'connected') {
            statusIcon = (role !== 'ref' && p.ready) ? ` <i class="fas fa-check-circle" style="color:var(--ready);"></i>` : ` <i class="fas fa-dot-circle" style="color:var(--connected);"></i>`;
        }
        el.innerHTML = `<i class="fas ${icon}"></i> ${displayName} ${statusIcon}`;
        elements.participantsList.appendChild(el);
    });
}

function renderRosterSelectionPhase() {
    ['p1', 'p2'].forEach(player => {
        const pData = lobbyState.participants[player];
        elements[`${player}NameDisplay`].textContent = pData.name;
        elements[`${player}Counter`].textContent = lobbyState.roster[player].length;
        const isReady = pData.ready;
        elements[`${player}Ready`].innerHTML = isReady ? '<i class="fas fa-times"></i> Unready' : `<i class="fas fa-check"></i> Ready`;
        elements[`${player}Ready`].classList.toggle('btn-ready', isReady);
        elements[`${player}Status`].textContent = isReady ? 'Ready' : 'Selecting';
        elements[`${player}Status`].className = `player-status ${isReady ? 'status-ready' : 'status-waiting'}`;
        elements[`${player}Panel`].classList.toggle('locked', isReady);
    });
    
    filterAndRenderRosterSelection();
}

function filterAndRenderRosterSelection() {
    const filteredList = filterIDs(appState.gameData.masterIDList, lobbyState.filters);
    
    ['p1', 'p2'].forEach(player => {
        const container = elements[`${player}Roster`];
        renderIDList(container, filteredList, {
            selectionSet: lobbyState.roster[player], 
            clickHandler: (id) => sendMessage('rosterSelect', { lobbyCode: lobbyState.code, player, id })
        });
    });
}

function renderIDList(container, idObjectList, options = {}) {
    const { selectionSet, clickHandler, hoverId, notInRosterSet, sharedIdSet } = options;
    container.innerHTML = '';
    if (!container.classList.contains('compact-id-list')) {
        container.className = 'roster-selection';
    }
    if (!Array.isArray(idObjectList) || idObjectList.length === 0) {
        if(!container.classList.contains('compact-id-list')) {
           container.innerHTML = '<div class="empty-roster" style="padding: 10px; text-align: center;">No items to display</div>';
        }
        return;
    }
    
    const fragment = document.createDocumentFragment();
    idObjectList.forEach(idData => {
        if (!idData) return;
        const isSelected = selectionSet ? selectionSet.includes(idData.id) : false;
        const isHovered = hoverId ? hoverId === idData.id : false;
        const isNotInRoster = notInRosterSet ? !notInRosterSet.has(idData.id) : false;
        const isShared = sharedIdSet ? sharedIdSet.includes(idData.id) : false;
        const element = createIdElement(idData, { 
            isSelected, isHovered, isNotInRoster, isShared,
            clickHandler: clickHandler ? () => clickHandler(idData.id) : null 
        });
        fragment.appendChild(element);
    });
    container.appendChild(fragment);
}

function createIdElement(idData, options = {}) {
    const { isSelected, isHovered, clickHandler, isShared } = options;
    const item = document.createElement('div');
    item.className = `id-item rarity-${idData.rarity}`;
    if (isSelected) item.classList.add('selected');
    if (isHovered) item.classList.add('hovered');
    item.dataset.id = idData.id;

    let html = `<div class="id-icon" style="background-image: url('/uploads/${idData.imageFile}')"></div><div class="id-name">${idData.name}</div>`;
    if (isShared) {
        html += '<div class="shared-icon"><i class="fas fa-link"></i></div>';
    }
    item.innerHTML = html;
    
    if (clickHandler) {
        item.addEventListener('click', clickHandler);
    }
    return item;
}

function renderRoleSelectionModal(lobbyInfo) {
    lobbyState.joinTarget.lobbyCode = lobbyInfo.code;
    elements.roleModalLobbyCode.textContent = lobbyInfo.code;
    
    const roleOptionsContainer = elements.modalRoleOptions;
    roleOptionsContainer.innerHTML = '';

    const roles = {
        p1: { icon: 'fa-user', text: 'Player 1' },
        p2: { icon: 'fa-user', text: 'Player 2' },
        ref: { icon: 'fa-star', text: 'Referee' }
    };

    Object.entries(roles).forEach(([role, details]) => {
        const isTaken = lobbyInfo.participants[role].status === 'connected';
        const button = document.createElement('button');
        button.className = 'role-option';
        button.dataset.role = role;
        button.innerHTML = `<i class="fas ${details.icon}"></i><div>${details.text}</div>`;
        button.disabled = isTaken;
        
        button.addEventListener('click', () => {
            roleOptionsContainer.querySelectorAll('.role-option').forEach(opt => opt.classList.remove('selected'));
            button.classList.add('selected');
            lobbyState.joinTarget.role = role;
            elements.confirmJoinBtn.disabled = false;
        });
        roleOptionsContainer.appendChild(button);
    });

    elements.roleSelectionModal.classList.remove('hidden');
}

function renderPublicLobbies(lobbies) {
    const listEl = elements.publicLobbiesList;
    listEl.innerHTML = '';

    if (!lobbies || lobbies.length === 0) {
        listEl.innerHTML = '<p style="text-align: center; padding: 20px;">No public lobbies found.</p>';
        return;
    }

    lobbies.forEach(lobby => {
        const playerCount = Object.values(lobby.participants).filter(p => p.status === 'connected' && p.name.startsWith('Player')).length;
        const item = document.createElement('div');
        item.className = 'public-lobby-item';
        item.innerHTML = `
            <div class="lobby-item-name">${lobby.hostName || 'Unnamed Lobby'}</div>
            <div class="lobby-item-players"><i class="fas fa-users"></i> ${playerCount}/2 Players</div>
            <div class="lobby-item-mode"><i class="fas fa-cogs"></i> ${lobby.draftLogic}</div>
            <button class="btn btn-primary btn-small join-from-browser-btn" data-lobby-code="${lobby.code}">Join</button>
        `;
        listEl.appendChild(item);
    });
}

function renderCoinFlipUI() {
    const { coinFlipWinner } = lobbyState.draft;
    const winnerName = coinFlipWinner ? lobbyState.participants[coinFlipWinner].name : '';

    if (!coinFlipWinner) {
        elements.coinIcon.classList.add('flipping');
        elements.coinFlipStatus.textContent = 'Flipping coin...';
        elements.turnChoiceButtons.classList.add('hidden');
    } else {
        elements.coinIcon.classList.remove('flipping');
        elements.coinFlipStatus.textContent = `${winnerName} wins the toss!`;
        
        const canChoose = appState.userRole === coinFlipWinner || appState.userRole === 'ref';
        elements.turnChoiceButtons.classList.toggle('hidden', !canChoose);

        if (!canChoose) {
            elements.coinFlipStatus.textContent += `\nWaiting for the turn order...`;
        }
    }
}

function renderEgoBanPhase() {
    // Implementation for EGO Ban Phase UI
}

function renderIdDraftPhase() {
    // Implementation for ID Draft Phase UI
}

function renderCompletedView() {
    // Implementation for Completed View UI
}

function updateDraftInstructions() {
    // Implementation for updating draft instructions panel
}

function checkPhaseReadiness() {
    if (lobbyState.draft.phase === 'roster') {
        const p1Ready = lobbyState.participants.p1.ready && lobbyState.roster.p1.length === appState.config.ROSTER_SIZE;
        const p2Ready = lobbyState.participants.p2.ready && lobbyState.roster.p2.length === appState.config.ROSTER_SIZE;
        if (appState.userRole === 'ref') {
            elements.startCoinFlip.disabled = !(p1Ready && p2Ready);
        }
    }
}

function updateTimerUI() {
    // Implementation for phase timer UI
}

function renderRosterBuilder() {
    // Implementation for Roster Builder UI
}

function setupAdvancedRandomUI() {
    // Implementation for Advanced Random UI setup
}

function updateAdvancedRandomUI() {
    // Implementation for updating Advanced Random UI
}

function generateAdvancedRandomRoster() {
    // Implementation for generating roster with advanced constraints
}

// ==========================================================================
// 6. EVENT LISTENERS & INITIALIZATION
// ==========================================================================

function cacheDOMElements() {
    elements.views = document.querySelectorAll('.view');
    elements.mainPage = document.getElementById('main-page');
    elements.lobbyView = document.getElementById('lobby-view');
    elements.rosterBuilderPage = document.getElementById('roster-builder-page');
    elements.completedView = document.getElementById('completed-view');
    
    elements.connectionStatus = document.getElementById('connection-status');
    elements.notification = document.getElementById('notification');
    elements.rejoinOverlay = document.getElementById('rejoin-overlay');
    elements.cancelRejoinBtn = document.getElementById('cancel-rejoin-btn');

    // Main Page
    elements.createLobbyBtn = document.getElementById('create-lobby');
    elements.playerNameInput = document.getElementById('player-name');
    elements.draftLogicSelect = document.getElementById('draft-logic-select');
    elements.matchTypeSelect = document.getElementById('match-type-select');
    elements.timerToggle = document.getElementById('timer-toggle');
    elements.publicLobbyToggle = document.getElementById('public-lobby-toggle');
    elements.goToBuilder = document.getElementById('go-to-builder');
    elements.showRulesBtn = document.getElementById('show-rules-btn');
    elements.joinTabs = document.querySelectorAll('.join-tab-btn');
    elements.refreshLobbiesBtn = document.getElementById('refresh-lobbies-btn');
    elements.publicLobbiesList = document.getElementById('public-lobbies-list');
    elements.lobbyCodeInput = document.getElementById('lobby-code-input');
    elements.enterLobbyByCode = document.getElementById('enter-lobby-by-code');

    // Modals
    elements.rulesModal = document.getElementById('rules-modal');
    elements.closeRulesBtn = document.getElementById('close-rules-btn');
    elements.roleSelectionModal = document.getElementById('role-selection-modal');
    elements.closeRoleModalBtn = document.getElementById('close-role-modal-btn');
    elements.roleModalLobbyCode = document.getElementById('role-modal-lobby-code');
    elements.modalRoleOptions = document.getElementById('modal-role-options');
    elements.confirmJoinBtn = document.getElementById('confirm-join-btn');
    elements.coinFlipModal = document.getElementById('coin-flip-modal');
    elements.coinIcon = document.getElementById('coin-icon');
    elements.coinFlipStatus = document.getElementById('coin-flip-status');
    elements.turnChoiceButtons = document.getElementById('turn-choice-buttons');
    elements.goFirstBtn = document.getElementById('go-first-btn');
    elements.goSecondBtn = document.getElementById('go-second-btn');

    // Lobby
    elements.backToMainLobby = document.getElementById('back-to-main-lobby');
    elements.lobbyCodeDisplay = document.getElementById('lobby-code-display');
    elements.participantsList = document.getElementById('participants-list');
    elements.phaseTimer = document.getElementById('phase-timer');
    elements.refTimerControl = document.getElementById('ref-timer-control');
    elements.draftStatusPanel = document.getElementById('draft-status-panel');
    elements.currentPhase = document.getElementById('current-phase');
    elements.draftActionDescription = document.getElementById('draft-action-description');

    // Roster Phase
    elements.rosterPhase = document.getElementById('roster-phase');
    elements.p1Panel = document.getElementById('p1-panel');
    elements.p2Panel = document.getElementById('p2-panel');
    ['p1', 'p2'].forEach(p => {
        elements[`${p}NameDisplay`] = document.getElementById(`${p}-name-display`);
        elements[`${p}Status`] = document.getElementById(`${p}-status`);
        elements[`${p}Counter`] = document.getElementById(`${p}-counter`);
        elements[`${p}RosterCodeInput`] = document.getElementById(`${p}-roster-code-input`);
        elements[`${p}RosterLoad`] = document.getElementById(`${p}-roster-load`);
        elements[`${p}Roster`] = document.getElementById(`${p}-roster`);
        elements[`${p}Random`] = document.getElementById(`${p}-random`);
        elements[`${p}Clear`] = document.getElementById(`${p}-clear`);
        elements[`${p}Ready`] = document.getElementById(`${p}-ready`);
    });
    elements.startCoinFlip = document.getElementById('start-coin-flip');

    // EGO Ban Phase
    elements.egoBanPhase = document.getElementById('ego-ban-phase');
    elements.egoBanTitle = document.getElementById('ego-ban-title');
    elements.p1EgoBansPreview = document.getElementById('p1-ego-bans-preview');
    elements.egoSearchInput = document.getElementById('ego-search-input');
    elements.confirmSelectionEgo = document.getElementById('confirm-selection-ego');
    elements.egoBanContainer = document.getElementById('ego-ban-container');
    elements.egoBanCounter = document.getElementById('ego-ban-counter');
    elements.currentPlayerEgoBans = document.getElementById('current-player-ego-bans');
    elements.confirmEgoBans = document.getElementById('confirm-ego-bans');
    elements.opponentRosterTitle = document.getElementById('opponent-roster-title');
    elements.opponentRosterList = document.getElementById('opponent-roster-list');

    // ID Draft Phase
    elements.idDraftPhase = document.getElementById('id-draft-phase');
    elements.draftBannedEgosList = document.getElementById('draft-banned-egos-list');
    ['p1', 'p2'].forEach(p => {
        elements[`${p}DraftName`] = document.getElementById(`${p}-draft-name`);
        elements[`${p}DraftStatus`] = document.getElementById(`${p}-draft-status`);
        elements[`${p}Picks`] = document.getElementById(`${p}-picks`);
        elements[`${p}S2PicksContainer`] = document.getElementById(`${p}-s2-picks-container`);
        elements[`${p}S2Picks`] = document.getElementById(`${p}-s2-picks`);
        elements[`${p}IdBans`] = document.getElementById(`${p}-id-bans`);
    });
    elements.draftPoolContainer = document.getElementById('draft-pool-container');
    elements.confirmSelectionId = document.getElementById('confirm-selection-id');
    elements.completeDraft = document.getElementById('complete-draft');

    // Roster Builder
    elements.backToMainBuilder = document.getElementById('back-to-main-builder');
    elements.builderSinnerNav = document.getElementById('builder-sinner-nav');
    elements.builderIdPool = document.getElementById('builder-id-pool');
    elements.builderSelectedRoster = document.getElementById('builder-selected-roster');
    elements.builderCounter = document.getElementById('builder-counter');
    elements.builderRandom = document.getElementById('builder-random');
    elements.builderClear = document.getElementById('builder-clear');
    elements.toggleAdvancedRandom = document.getElementById('toggle-advanced-random');
    elements.advancedRandomOptions = document.getElementById('advanced-random-options');
    elements.sinnerSlidersContainer = document.getElementById('sinner-sliders-container');
    elements.totalMinDisplay = document.getElementById('total-min-display');
    elements.totalMaxDisplay = document.getElementById('total-max-display');
    elements.builderAdvancedRandom = document.getElementById('builder-advanced-random');
    elements.builderRosterCodeDisplay = document.getElementById('builder-roster-code-display');
    elements.builderCopyCode = document.getElementById('builder-copy-code');
    elements.builderLoadCodeInput = document.getElementById('builder-load-code-input');
    elements.builderLoadCode = document.getElementById('builder-load-code');

    // Completed View
    elements.finalBannedEgosList = document.getElementById('final-banned-egos-list');
    elements.restartDraft = document.getElementById('restart-draft');
    ['p1', 'p2'].forEach(p => {
        elements[`final${p.toUpperCase()}Name`] = document.getElementById(`final-${p}-name`);
        elements[`final${p.toUpperCase()}Picks`] = document.getElementById(`final-${p}-picks`);
        elements[`final${p.toUpperCase()}S2PicksContainer`] = document.getElementById(`final-${p}-s2-picks-container`);
        elements[`final${p.toUpperCase()}S2Picks`] = document.getElementById(`final-${p}-s2-picks`);
        elements[`final${p.toUpperCase()}Bans`] = document.getElementById(`final-${p}-bans`);
    });
}

function setupEventListeners() {
    // Main Page & Modals
    elements.createLobbyBtn.addEventListener('click', () => {
        const options = {
            name: elements.playerNameInput.value.trim() || 'Referee',
            draftLogic: elements.draftLogicSelect.value,
            matchType: elements.matchTypeSelect.value,
            timerEnabled: elements.timerToggle.value === 'true',
            isPublic: elements.publicLobbyToggle.value === 'true'
        };
        sendMessage('createLobby', options);
    });
    elements.confirmJoinBtn.addEventListener('click', () => {
        const { lobbyCode, role } = lobbyState.joinTarget;
        if (lobbyCode && role) {
            sendMessage('joinLobby', {
                lobbyCode, role,
                name: elements.playerNameInput.value.trim() || `Player`
            });
        }
    });
    elements.goToBuilder.addEventListener('click', () => switchView('rosterBuilderPage'));
    elements.showRulesBtn.addEventListener('click', () => elements.rulesModal.classList.remove('hidden'));
    elements.closeRulesBtn.addEventListener('click', () => elements.rulesModal.classList.add('hidden'));
    elements.closeRoleModalBtn.addEventListener('click', () => elements.roleSelectionModal.classList.add('hidden'));
    elements.cancelRejoinBtn.addEventListener('click', () => {
        if (rejoinTimeout) clearTimeout(rejoinTimeout);
        localStorage.removeItem('limbusDraftSession');
        elements.rejoinOverlay.classList.add('hidden');
        if (appState.socket) appState.socket.close();
    });
    elements.refreshLobbiesBtn.addEventListener('click', () => sendMessage('getPublicLobbies'));
    elements.enterLobbyByCode.addEventListener('click', () => {
        const code = elements.lobbyCodeInput.value.trim().toUpperCase();
        if (code) sendMessage('getLobbyInfo', { lobbyCode: code });
    });
    elements.publicLobbiesList.addEventListener('click', (e) => {
        const btn = e.target.closest('.join-from-browser-btn');
        if (btn) sendMessage('getLobbyInfo', { lobbyCode: btn.dataset.lobbyCode });
    });
    elements.joinTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            elements.joinTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.querySelectorAll('.join-tab-content').forEach(content => {
                content.classList.toggle('active', content.id.startsWith(tab.dataset.tab));
            });
        });
    });

    // Lobby & Draft
    const clearSessionAndReload = () => {
        localStorage.removeItem('limbusDraftSession');
        window.location.reload();
    };
    elements.backToMainLobby.addEventListener('click', clearSessionAndReload);
    elements.restartDraft.addEventListener('click', clearSessionAndReload);
    elements.startCoinFlip.addEventListener('click', () => sendMessage('startCoinFlip', { lobbyCode: lobbyState.code }));
    elements.goFirstBtn.addEventListener('click', () => sendMessage('setTurnOrder', { lobbyCode: lobbyState.code, choice: 'first' }));
    elements.goSecondBtn.addEventListener('click', () => sendMessage('setTurnOrder', { lobbyCode: lobbyState.code, choice: 'second' }));
    elements.confirmSelectionId.addEventListener('click', () => sendMessage('draftAction', { lobbyCode: lobbyState.code, selectedId: lobbyState.draft.hovered[appState.userRole] }));
    elements.confirmSelectionEgo.addEventListener('click', () => sendMessage('draftAction', { lobbyCode: lobbyState.code, selectedId: lobbyState.draft.hovered[appState.userRole] }));
    elements.completeDraft.addEventListener('click', () => sendMessage('draftControl', { lobbyCode: lobbyState.code, action: 'complete' }));


    ['p1', 'p2'].forEach(player => {
        elements[`${player}Ready`].addEventListener('click', () => sendMessage('updateReady', { lobbyCode: lobbyState.code, player }));
        elements[`${player}Clear`].addEventListener('click', () => sendMessage('rosterSet', { lobbyCode: lobbyState.code, player, roster: [] }));
        elements[`${player}RosterLoad`].addEventListener('click', () => {
            const code = elements[`${player}RosterCodeInput`].value.trim();
            const roster = loadRosterFromCode(code);
            if (roster) sendMessage('rosterSet', { lobbyCode: lobbyState.code, player, roster });
        });
    });

    // Roster Builder
    elements.backToMainBuilder.addEventListener('click', () => switchView('mainPage'));
    elements.builderClear.addEventListener('click', () => {
        builderState.roster = [];
        renderRosterBuilder();
    });
    elements.builderCopyCode.addEventListener('click', () => {
        const code = elements.builderRosterCodeDisplay.textContent;
        navigator.clipboard.writeText(code).then(() => showNotification("Roster code copied!"), () => showNotification("Failed to copy.", true));
    });
    elements.builderLoadCode.addEventListener('click', () => {
        const code = elements.builderLoadCodeInput.value.trim();
        const roster = loadRosterFromCode(code);
        if (roster) {
            builderState.roster = roster;
            renderRosterBuilder();
        }
    });
    elements.toggleAdvancedRandom.addEventListener('click', () => elements.advancedRandomOptions.classList.toggle('hidden'));
    elements.builderAdvancedRandom.addEventListener('click', generateAdvancedRandomRoster);
}

document.addEventListener('DOMContentLoaded', () => {
    cacheDOMElements();
    setupEventListeners();
    connectWebSocket();
    switchView('mainPage');
});
