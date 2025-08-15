// =================================================================================
// FILE: script.js
// DESCRIPTION: This version adds a tooltip feature. When a user hovers over an
// ID icon in a view where the name is hidden (like the draft screen or the final
// summary), the full ID name will appear in a tooltip after a 1-second delay.
// =================================================================================
// ======================
// CONSTANTS & CONFIG
// ======================
const EGO_BAN_COUNT = 5;
const SINNER_ORDER = ["Yi Sang", "Faust", "Don Quixote", "Ryōshū", "Meursault", "Hong Lu", "Heathcliff", "Ishmael", "Rodion", "Sinclair", "Outis", "Gregor"];
const zayinBanExceptions = [
    "Bygone Days (Yi Sang)",
    "Soda (Ryōshū)",
    "Holiday (Heathcliff)",
    "Hundred-Footed Death Maggot [蝍蛆殺] (Ishmael)",
    "Cavernous Wailing (Sinclair)",
    "Legerdemain (Gregor)"
];
// ======================
// APPLICATION STATE
// ======================
const state = {
    currentView: "main",
    lobbyCode: "",
    userId: generateUserId(),
    userRole: "",
    rejoinToken: null,
    participants: {
        p1: { name: "Player 1", status: "disconnected", ready: false, reserveTime: 120 },
        p2: { name: "Player 2", status: "disconnected", ready: false, reserveTime: 120 },
        ref: { name: "Referee", status: "disconnected" }
    },
    roster: { p1: [], p2: [] },
    builderRoster: [],
    builderRosterSize: 42,
    masterIDList: [],
    builderMasterIDList: [],
    masterEGOList: [],
    idsBySinner: null,
    builderSelectedSinner: "Yi Sang",
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
        draftLogic: '1-2-2',
        matchType: 'section1',
        rosterSize: 42,
        coinFlipWinner: null,
        turnOrderDecided: false,
        timer: {
            enabled: false,
            running: false,
            endTime: 0,
            isReserve: false
        }
    },
    filters: { sinner: "", sinAffinity: "", keyword: "", rosterSearch: "" },
    draftFilters: { sinner: "", sinAffinity: "", keyword: "", rosterSearch: "" },
    egoSearch: "",
    timerInterval: null,
    socket: null,
    joinTarget: {
        lobbyCode: null,
        role: null,
    }
};

let elements = {};

// ======================
// UTILITY & CORE
// ======================
function generateUserId() {
    return 'user-' + Math.random().toString(36).substr(2, 9);
}

function showNotification(text, isError = false) {
    elements.notification.textContent = text;
    elements.notification.style.background = isError ? 'var(--disconnected)' : 'var(--primary)';
    elements.notification.classList.add('show');
    setTimeout(() => { elements.notification.classList.remove('show'); }, 3000);
}

function createSlug(name) {
    if (!name) return '';
    let slug = name.toLowerCase();
    slug = slug.replace(/ryōshū/g, 'ryshu').replace(/öufi/g, 'ufi');
    slug = slug.replace(/e\.g\.o::/g, 'ego-');
    slug = slug.replace(/ & /g, ' ').replace(/[.'"]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/[^\w-]+/g, '');
    return slug;
}

// ======================
// DATA HANDLING
// ======================
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
        const sinnerMatch = name.match(/(Yi Sang|Faust|Don Quixote|Ryōshū|Meursault|Hong Lu|Heathcliff|Ishmael|Rodion|Sinclair|Outis|Gregor)/);
        
        result.push({
            id: createSlug(name), 
            name: name,
            keywords: obj.Keywords ? obj.Keywords.split(',').map(k => k.trim()) : [],
            sinAffinities: obj.SinAffinities ? obj.SinAffinities.split(',').map(s => s.trim()) : [],
            rarity: obj.Rarity,
            imageFile: `${createSlug(name)}.webp`, 
            sinner: sinnerMatch ? sinnerMatch[0] : "Unknown",
        });
    }
    return result;
}

function parseEGOData(data) {
    const lines = data.trim().split('\n');
    const egoList = [];
    const bgColorMap = { 
        'Yellow': 'var(--sin-sloth-bg)', 'Blue': 'var(--sin-gloom-bg)', 'Red': 'var(--sin-wrath-bg)',
        'Indigo': 'var(--sin-pride-bg)', 'Purple': 'var(--sin-envy-bg)', 'Orange': 'var(--sin-lust-bg)',
        'Green': 'var(--sin-gluttony-bg)'
    };
    
    lines.forEach(line => {
        if (!line.includes(' - ')) return;
        const parts = line.split(' - ');
        if (parts.length < 4) return;

        const nameAndSinner = parts[0];
        const rarity = parts[1].trim();
        const sin = parts[2].trim();
        const color = parts[3].trim();

        let sinner = "Unknown";
        let name = nameAndSinner;

        for (const s of SINNER_ORDER) {
            if (nameAndSinner.includes(s)) {
                sinner = s;
                name = nameAndSinner.replace(s, '').trim();
                break;
            }
        }
        
        egoList.push({
            id: createSlug(`${name} ${sinner}`),
            name: `${name} (${sinner})`, sinner, rarity, sin, color,
            cssColor: bgColorMap[color] || 'rgba(128, 128, 128, 0.7)'
        });
    });
    return egoList;
}

// ======================
// ROSTER CODE SYSTEM
// ======================
function generateRosterCode() {
    if (state.builderRoster.length !== state.builderRosterSize) return null;
    try {
        const indices = state.builderRoster.map(slug => {
            const index = state.masterIDList.findIndex(id => id.id === slug);
            return index > -1 ? index : 255; // Use 255 as an error/not found marker
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
        const rosterSize = binaryString.length;

        if (rosterSize !== 42 && rosterSize !== 52) {
            showNotification(`Invalid roster code: unsupported size (${rosterSize}).`, true);
            return null;
        }

        const uint8Array = new Uint8Array(binaryString.split('').map(c => c.charCodeAt(0)));
        const rosterSlugs = Array.from(uint8Array).map(index => {
            return (index < state.masterIDList.length) ? state.masterIDList[index].id : null;
        }).filter(Boolean);

        if (rosterSlugs.length !== rosterSize) {
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

// ======================
// SOCKET COMMUNICATION
// ======================
let rejoinTimeout;

function connectWebSocket() {
    const loc = window.location;
    const wsProtocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    const remoteUrl = `${wsProtocol}//${window.location.host}`;
    state.socket = new WebSocket(remoteUrl);

    elements.connectionStatus.className = 'connection-status connecting';
    elements.connectionStatus.innerHTML = '<i class="fas fa-plug"></i> <span>Connecting...</span>';

    state.socket.onopen = () => {
        elements.connectionStatus.className = 'connection-status connected';
        elements.connectionStatus.innerHTML = '<i class="fas fa-plug"></i> <span>Connected</span>';
        
        const session = JSON.parse(localStorage.getItem('limbusDraftSession'));
        if (session && session.lobbyCode && session.userRole && session.rejoinToken) {
            console.log('Found session, attempting to rejoin:', session);
            elements.rejoinOverlay.style.display = 'flex';
            sendMessage({ 
                type: 'rejoinLobby', 
                lobbyCode: session.lobbyCode,
                role: session.userRole,
                rejoinToken: session.rejoinToken
            });

            rejoinTimeout = setTimeout(() => {
                if (elements.rejoinOverlay.style.display === 'flex') {
                    elements.rejoinOverlay.style.display = 'none';
                    localStorage.removeItem('limbusDraftSession');
                    showNotification("Failed to rejoin lobby. Session cleared.", true);
                }
            }, 10000);
        }
    };
    state.socket.onmessage = (event) => handleServerMessage(JSON.parse(event.data));
    state.socket.onclose = () => {
        elements.connectionStatus.className = 'connection-status';
        elements.connectionStatus.innerHTML = '<i class="fas fa-plug"></i> <span>Disconnected</span>';
        if (state.timerInterval) clearInterval(state.timerInterval);
    };
    state.socket.onerror = (error) => console.error('WebSocket error:', error);
}

function sendMessage(message) {
    if (state.socket && state.socket.readyState === WebSocket.OPEN) {
        state.socket.send(JSON.stringify(message));
    }
}

function handleServerMessage(message) {
    console.log("Received from server:", message);
    switch (message.type) {
        case 'lobbyCreated': handleLobbyCreated(message); break;
        case 'lobbyJoined': handleLobbyJoined(message); break;
        case 'stateUpdate':
            if (message.newRole && message.newRole !== state.userRole) {
                console.log(`Role updated by server from ${state.userRole} to ${message.newRole}`);
                state.userRole = message.newRole;
                
                const session = JSON.parse(localStorage.getItem('limbusDraftSession'));
                if (session) {
                    session.userRole = message.newRole;
                    localStorage.setItem('limbusDraftSession', JSON.stringify(session));
                    console.log('Updated session storage with new role.');
                }
            }
            handleStateUpdate(message);
            break;
        case 'publicLobbiesList': renderPublicLobbies(message.lobbies); break;
        case 'lobbyInfo': showRoleSelectionModal(message.lobby); break;
        case 'notification': showNotification(message.text); break;
        case 'error':
            showNotification(`Error: ${message.message}`, true);
            if (message.message.includes('rejoin') || message.message.includes('Clearing session')) {
                localStorage.removeItem('limbusDraftSession');
                elements.rejoinOverlay.style.display = 'none';
                if (rejoinTimeout) clearTimeout(rejoinTimeout);
            }
            break;
    }
}

// ======================
// UI RENDERING & DOM MANIPULATION
// ======================
function sortIdsByMasterList(idList) {
    if (!Array.isArray(idList)) return [];
    return idList.slice().sort((a, b) => {
        const indexA = state.masterIDList.findIndex(item => item.id === a);
        const indexB = state.masterIDList.findIndex(item => item.id === b);
        return indexA - indexB;
    });
}

function createIdElement(idData, options = {}) {
    const { isSelected, isHovered, clickHandler, isNotInRoster, isShared } = options;
    const idElement = document.createElement('div');
    idElement.className = `id-item rarity-${idData.rarity}`;
    if (isSelected) idElement.classList.add('selected');
    if (isHovered) idElement.classList.add('hovered');

    idElement.dataset.id = idData.id;
    let html = `<div class="id-icon" style="background-image: url('/uploads/${idData.imageFile}')"></div><div class="id-name">${idData.name}</div>`;
    if (isShared) {
        html += '<div class="shared-icon"><i class="fas fa-link"></i></div>';
    }
    idElement.innerHTML = html;
    
    if (clickHandler) {
        idElement.addEventListener('click', () => clickHandler(idData.id));
    }
    return idElement;
}

function createEgoElement(egoData, options = {}) {
    const { clickHandler, isHovered } = options;
    const egoElement = document.createElement('div');
    const allBans = [...state.draft.egoBans.p1, ...state.draft.egoBans.p2];
    const isBanned = allBans.includes(egoData.id);
    
    egoElement.className = 'ego-item';
    if (isBanned) egoElement.classList.add('banned');
    if (isHovered) egoElement.classList.add('hovered');

    egoElement.dataset.id = egoData.id;
    egoElement.style.borderLeftColor = egoData.cssColor;

    egoElement.innerHTML = `
        <div class="ego-header"><span class="ego-rarity">${egoData.rarity}</span></div>
        <div class="ego-name">${egoData.name}</div>`;
    
    if (clickHandler && !isBanned) {
        egoElement.addEventListener('click', () => clickHandler(egoData.id));
    }
    return egoElement;
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
        const isNotInRoster = notInRosterSet ? !notInRosterSet.includes(idData.id) : false;
        const isShared = sharedIdSet ? sharedIdSet.includes(idData.id) : false;
        const element = createIdElement(idData, { 
            isSelected, 
            isHovered,
            isNotInRoster,
            isShared,
            clickHandler: clickHandler ? () => clickHandler(idData.id) : null 
        });
        fragment.appendChild(element);
    });
    container.appendChild(fragment);
}

function renderGroupedView(container, idObjectList, options = {}) {
    const { clickHandler, selectionSet, hoverId, notInRosterSet, sharedIdSet } = options;

    container.innerHTML = '';
    container.className = 'sinner-grouped-roster';

    if (!Array.isArray(idObjectList) || idObjectList.length === 0) {
        container.innerHTML = '<div class="empty-roster" style="padding: 10px; text-align: center;">No items to display.</div>';
        return;
    }

    const groupedBySinner = {};

    idObjectList.forEach(id => {
        if (!id) return;
        if (!groupedBySinner[id.sinner]) {
            groupedBySinner[id.sinner] = [];
        }
        groupedBySinner[id.sinner].push(id);
    });

    const fragment = document.createDocumentFragment();
    let isFirstRenderedGroup = true;

    SINNER_ORDER.forEach(sinnerName => {
        if (groupedBySinner[sinnerName] && groupedBySinner[sinnerName].length > 0) {
            const sinnerRow = document.createElement('div');
            sinnerRow.className = 'sinner-row';

            if (!isFirstRenderedGroup) {
                const sinnerHeader = document.createElement('div');
                sinnerHeader.className = 'sinner-header';
                sinnerRow.appendChild(sinnerHeader);
            }
            isFirstRenderedGroup = false;

            const idContainer = document.createElement('div');
            idContainer.className = 'sinner-id-container';

            const sortedIds = groupedBySinner[sinnerName].sort((a,b) => {
                const indexA = state.masterIDList.findIndex(item => item.id === a.id);
                const indexB = state.masterIDList.findIndex(item => item.id === b.id);
                return indexA - indexB;
            });

            sortedIds.forEach(idData => {
                const isSelected = selectionSet ? selectionSet.includes(idData.id) : false;
                const isHovered = hoverId ? hoverId === idData.id : false;
                const isNotInRoster = notInRosterSet ? !notInRosterSet.includes(idData.id) : false;
                const isShared = sharedIdSet ? sharedIdSet.includes(idData.id) : false;
                const idElement = createIdElement(idData, { isSelected, isHovered, isNotInRoster, isShared, clickHandler });
                idContainer.appendChild(idElement);
            });
            sinnerRow.appendChild(idContainer);
            fragment.appendChild(sinnerRow);
        }
    });

    container.appendChild(fragment);
}

function switchView(view) {
    console.log('Switching to view:', view);
    state.currentView = view;
    
    ['mainPage', 'lobbyView', 'completedView', 'rosterBuilderPage'].forEach(pageId => {
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
}


function updateAllUIsFromState() {
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


    if (phase === 'coinFlip') {
        handleCoinFlipUI();
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
            statusIcon = (role !== 'ref' && p.ready) ? ` <i class="fas fa-check-circle" style="color:var(--ready);"></i>` : ` <i class="fas fa-dot-circle" style="color:var(--connected);"></i>`;
        }
        el.innerHTML = `<i class="fas ${icon}"></i> ${displayName} ${statusIcon}`;
        elements.participantsList.appendChild(el);

        if ((role === 'p1' || role === 'p2') && p.reserveTime !== undefined) {
            const reserveTimeEl = document.getElementById(`${role}-reserve-time`);
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

        // FIX: Disable/enable buttons based on ready state
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
    checkPhaseReadiness();
    updateTimerUI();
}


function filterAndRenderRosterSelection() {
    const filteredList = filterIDs(state.masterIDList, state.filters);
    
    ['p1', 'p2'].forEach(player => {
        const container = elements[`${player}Roster`];
        const scrollTop = container.scrollTop;
        renderIDList(container, filteredList, {
            selectionSet: state.roster[player], 
            clickHandler: (id) => toggleIDSelection(player, id)
        });
        container.scrollTop = scrollTop;
    });
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

function renderEgoBanPhase() {
    const { currentPlayer, hovered, egoBans } = state.draft;
    const opponent = currentPlayer === 'p1' ? 'p2' : 'p1';
    
    elements.egoBanTitle.textContent = `EGO Ban Phase - ${state.participants[currentPlayer].name}'s Turn`;

    const clickHandler = (state.userRole === currentPlayer || state.userRole === 'ref') ? hoverEgoToBan : null;
    
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
        item.innerHTML = `<span class="rarity">[${ego.rarity}]</span> <span class="name" style="text-decoration: none;">${ego.name}</span>`;
        bansContainer.appendChild(item);
    });
    elements.egoBanCounter.textContent = currentPlayerBans.length;

    elements.opponentRosterTitle.textContent = `${state.participants[opponent].name}'s Roster`;
    const opponentRosterObjects = state.roster[opponent].map(id => state.masterIDList.find(item => item.id === id)).filter(Boolean);
    renderGroupedView(elements.opponentRosterList, opponentRosterObjects, {});

    const canConfirm = (state.userRole === 'ref' || state.userRole === currentPlayer) && currentPlayerBans.length === EGO_BAN_COUNT;
    elements.confirmEgoBans.disabled = !canConfirm;
    elements.confirmSelectionEgo.disabled = !hovered[currentPlayer];

    const p1BansPreview = elements.p1EgoBansPreview;
    if (currentPlayer === 'p2' && egoBans.p1.length === EGO_BAN_COUNT) {
        p1BansPreview.classList.remove('hidden');
        const p1BannedObjects = egoBans.p1.map(id => state.masterEGOList.find(e => e.id === id)).filter(Boolean);
        const listEl = p1BansPreview.querySelector('.banned-egos-list');
        listEl.innerHTML = '';
        p1BannedObjects.forEach(ego => {
            const item = document.createElement('div');
            item.className = 'banned-ego-item';
            item.style.backgroundColor = ego.cssColor;
            item.innerHTML = `<span class="rarity">[${ego.rarity}]</span> <span class="name">${ego.name}</span>`;
            listEl.appendChild(item);
        });
    } else {
        p1BansPreview.classList.add('hidden');
    }
}

function renderBannedEgosDisplay() {
    const allBans = [...state.draft.egoBans.p1, ...state.draft.egoBans.p2];
    const bannedEgoObjects = allBans.map(id => state.masterEGOList.find(ego => ego.id === id)).filter(Boolean);
    
    const renderList = (container) => {
        container.innerHTML = '';
        bannedEgoObjects.forEach(ego => {
            const item = document.createElement('div');
            item.className = 'banned-ego-item';
            item.style.backgroundColor = ego.cssColor;
            item.innerHTML = `<span class="rarity">[${ego.rarity}]</span> <span class="name">${ego.name}</span>`;
            container.appendChild(item);
        });
    };

    renderList(elements.draftBannedEgosList);
    renderList(elements.finalBannedEgosList);
}

function updateDraftUI() {
    elements.p1DraftName.textContent = state.participants.p1.name;
    elements.p2DraftName.textContent = state.participants.p2.name;

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
        // In the new logic, S2 picks are just part of the main picks.
        // This section might need adjustment based on how we want to display the 18 picks.
        // For now, let's assume they all go into the main pick list.
        elements.p1S2Picks.innerHTML = '';
        elements.p2S2Picks.innerHTML = '';
    } else {
        // Handle old logic for section1 only matches with a potential pick_s2 phase
        renderCompactIdListChronological(elements.p1S2Picks, [...state.draft.picks_s2.p1].reverse());
        renderCompactIdListChronological(elements.p2S2Picks, [...state.draft.picks_s2.p2].reverse());
    }
    
    const { currentPlayer } = state.draft;
    elements.p1DraftStatus.textContent = currentPlayer === "p1" ? "Drafting" : "Waiting";
    elements.p2DraftStatus.textContent = currentPlayer === "p2" ? "Drafting" : "Waiting";
    elements.p1DraftStatus.className = `player-status ${currentPlayer === "p1" ? "status-drafting" : "status-waiting"}`;
    elements.p2DraftStatus.className = `player-status ${currentPlayer === "p2" ? "status-drafting" : "status-waiting"}`;
    
    elements.p1DraftColumn.classList.toggle('draft-active', currentPlayer === 'p1');
    elements.p2DraftColumn.classList.toggle('draft-active', currentPlayer === 'p2');
    elements.draftInteractionHub.classList.toggle('draft-active', !!currentPlayer);


    renderBannedEgosDisplay();
}

function updateDraftInstructions() {
    let phaseText = "", actionDesc = "";
    const { phase, currentPlayer, action, actionCount, egoBans, hovered, matchType } = state.draft;
    
    const hub = elements.draftInteractionHub;
    const existingPool = hub.querySelector('.sinner-grouped-roster');
    const existingScrollTop = existingPool ? existingPool.scrollTop : 0;

    elements.draftPoolContainer.innerHTML = '';

    switch(phase) {
        case "roster": 
            phaseText = "Roster Selection";
            actionDesc = `Players select ${state.draft.rosterSize} IDs. Referee starts the draft when both are ready.`;
            break;
        case "coinFlip":
            phaseText = "Coin Flip";
            actionDesc = "Winner of the coin flip will decide who goes first.";
            break;
        case "egoBan":
            const bansLeft = EGO_BAN_COUNT - (egoBans[currentPlayer] ? egoBans[currentPlayer].length : 0);
            phaseText = `EGO Ban Phase - ${state.participants[currentPlayer].name}'s turn`;
            actionDesc = `Select and confirm ${bansLeft} more EGO(s) to ban.`;
            break;
        case "ban":
        case "pick":
        case "midBan":
        case "pick2":
        case "pick_s2":
            let displayAction = phase;
            if (phase === 'midBan') displayAction = `Mid-Draft Ban (${matchType === 'allSections' ? 4 : 3} each)`;
            if (phase === 'pick') displayAction = 'Pick Phase 1 (6 each)';
            if (phase === 'pick2') displayAction = `Pick Phase 2 (${matchType === 'allSections' ? 12 : 6} each)`;
            if (phase === 'pick_s2') displayAction = 'Pick Phase 3 (Sec 2/3 - 6 each)';

            phaseText = `${displayAction.charAt(0).toUpperCase() + displayAction.slice(1)}`;
            
            let actionVerb = (phase.includes('ban')) ? 'ban' : 'pick';
            actionDesc = `${state.participants[currentPlayer].name} to ${actionVerb} ${actionCount} ID(s)`;
            break;
        case "complete":
            phaseText = "Draft Completed!";
            actionDesc = "All picks and bans are finalized.";
            break;
        default:
            phaseText = "Waiting for draft to start...";
    }

    if (['ban', 'pick', 'midBan', 'pick2', 'pick_s2'].includes(phase)) {
        const opponent = currentPlayer === 'p1' ? 'p2' : 'p1';
        const isBanAction = phase.includes('ban');

        let availableIdList;
        if (isBanAction) {
            // Show the FULL opponent roster (minus already banned/picked IDs)
            const opponentRoster = state.roster[opponent] || [];
            const blocked = new Set([
                ...state.draft.idBans.p1,
                ...state.draft.idBans.p2,
                ...state.draft.picks.p1,
                ...state.draft.picks.p2,
                ...state.draft.picks_s2.p1,
                ...state.draft.picks_s2.p2
            ]);
            availableIdList = opponentRoster.filter(id => !blocked.has(id));
        } else {
            availableIdList = state.draft.available[currentPlayer] || [];
        }

        if (!availableIdList) {
            console.error(`[Draft Render] ERROR: availableIdList for draft pool render`);
            return;
        }

        let availableObjects = availableIdList.map(id => state.masterIDList.find(item => item && item.id === id)).filter(Boolean);
        
        availableObjects = filterIDs(availableObjects, state.draftFilters, { draftPhase: true });
        
        const clickHandler = (state.userRole === currentPlayer || state.userRole === 'ref') ? (id) => hoverDraftID(id) : null;
        
        const poolEl = document.createElement('div');
        poolEl.className = 'sinner-grouped-roster';
        poolEl.style.maxHeight = '60vh';
        elements.draftPoolContainer.appendChild(poolEl);

        const sharedIds = state.roster.p1.filter(id => state.roster.p2.includes(id));
        renderGroupedView(poolEl, availableObjects, { 
            clickHandler, 
            hoverId: hovered[currentPlayer],
            sharedIdSet: sharedIds
        });

        poolEl.scrollTop = existingScrollTop;

        elements.confirmSelectionId.disabled = !hovered[currentPlayer] || state.draft.actionCount <= 0;
    }
    
    elements.currentPhase.textContent = phaseText;
    elements.draftActionDescription.textContent = actionDesc;
    elements.completeDraft.disabled = state.userRole !== 'ref' || phase === 'complete';
}

function handleCoinFlipUI() {
    const { coinFlipWinner } = state.draft;
    const winnerName = coinFlipWinner ? state.participants[coinFlipWinner].name : '';

    if (!coinFlipWinner) {
        elements.coinIcon.classList.add('flipping');
        elements.coinFlipStatus.textContent = 'Flipping coin...';
        elements.turnChoiceButtons.classList.add('hidden');
    } else {
        elements.coinIcon.classList.remove('flipping');
        elements.coinFlipStatus.textContent = `${winnerName} wins the toss!`;
        
        const canChoose = state.userRole === coinFlipWinner || state.userRole === 'ref';

        if (canChoose) {
            elements.turnChoiceButtons.classList.remove('hidden');
            if (state.userRole === 'ref' && state.userRole !== coinFlipWinner) {
                 elements.coinFlipStatus.innerHTML = `${winnerName} wins the toss!<br><small>Waiting for them to choose (or you can choose for them).</small>`;
            }
        } else {
            elements.turnChoiceButtons.classList.add('hidden');
            elements.coinFlipStatus.textContent += `\nWaiting for the turn order to be decided...`;
        }
    }
}

function renderCompletedView() {
    const renderChronologicalIdList = (container, idList) => {
        container.innerHTML = '';
        const idObjects = idList.map(id => state.masterIDList.find(item => item.id === id)).filter(Boolean);
        const fragment = document.createDocumentFragment();
        idObjects.forEach(idData => {
            const element = createIdElement(idData, {});
            fragment.appendChild(element);
        });
        container.appendChild(fragment);
    };

    elements.finalP1Name.textContent = `${state.participants.p1.name}'s Roster`;
    elements.finalP2Name.textContent = `${state.participants.p2.name}'s Roster`;

    renderChronologicalIdList(elements.finalP1Picks, state.draft.picks.p1);
    renderChronologicalIdList(elements.finalP2Picks, state.draft.picks.p2);

    const isAllSections = state.draft.matchType === 'allSections';
    // The new logic puts all picks into the main `picks` array.
    // The S2 container is only for the old logic.
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
}


function checkPhaseReadiness() {
    if (state.draft.phase === 'roster') {
        const { rosterSize } = state.draft;
        const p1Ready = state.participants.p1.ready && state.roster.p1.length === rosterSize;
        const p2Ready = state.participants.p2.ready && state.roster.p2.length === rosterSize;
        if (state.userRole === 'ref') {
            elements.startCoinFlip.disabled = !(p1Ready && p2Ready);
        }
    }
}

function renderRosterBuilder() {
    const sinnerNav = elements.builderSinnerNav;
    sinnerNav.innerHTML = '';
    
    SINNER_ORDER.forEach(sinnerName => {
        const btn = document.createElement('button');
        btn.className = 'btn sinner-nav-btn';
        btn.textContent = sinnerName;
        if (sinnerName === state.builderSelectedSinner) {
            btn.classList.add('selected');
        }
        btn.addEventListener('click', () => {
            state.builderSelectedSinner = sinnerName;
            renderRosterBuilder();
        });
        sinnerNav.appendChild(btn);
    });

    const sinnerIDs = state.idsBySinner[state.builderSelectedSinner];
    const filteredSinnerIDs = filterIDs(sinnerIDs, state.filters, { builderPhase: true });
    renderIDList(elements.builderIdPool, filteredSinnerIDs, {
        selectionSet: state.builderRoster, 
        clickHandler: toggleBuilderIdSelection
    });

    const sortedSelectedRoster = [...state.builderRoster].sort((a, b) => {
        const indexA = state.masterIDList.findIndex(item => item.id === a);
        const indexB = state.masterIDList.findIndex(item => item.id === b);
        return indexA - indexB;
    });
    const selectedObjects = sortedSelectedRoster.map(id => state.masterIDList.find(item => item.id === id)).filter(Boolean);
    
    renderGroupedView(elements.builderSelectedRoster, selectedObjects, { 
        selectionSet: state.builderRoster, 
        clickHandler: toggleBuilderIdSelection 
    });

    elements.builderCounter.textContent = state.builderRoster.length;
    elements.builderRosterSize.textContent = state.builderRosterSize;
    
    if(state.builderRoster.length === state.builderRosterSize) {
        const code = generateRosterCode();
        elements.builderRosterCodeDisplay.textContent = code || "Error generating code.";
        elements.builderCopyCode.disabled = !code;
    } else {
        elements.builderRosterCodeDisplay.textContent = `Select ${state.builderRosterSize - state.builderRoster.length} more IDs to generate a code.`;
        elements.builderCopyCode.disabled = true;
    }
}

function updateTimerUI() {
    const { timer } = state.draft;
    elements.refTimerControl.classList.toggle('hidden', !timer.enabled || state.userRole !== 'ref');
    elements.phaseTimer.classList.toggle('hidden', !timer.enabled);

    elements.phaseTimer.classList.toggle('reserve-active', timer.isReserve);

    if (!timer.enabled || !timer.running) {
        elements.phaseTimer.textContent = "--:--";
        if(state.timerInterval) clearInterval(state.timerInterval);
        state.timerInterval = null;
        return;
    }

    if (!state.timerInterval) {
        state.timerInterval = setInterval(updateTimerUI, 1000);
    }

    const remaining = Math.max(0, Math.round((timer.endTime - Date.now()) / 1000));
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    elements.phaseTimer.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function renderPublicLobbies(lobbies) {
    const listEl = elements.publicLobbiesList;
    listEl.innerHTML = '';

    if (!lobbies || lobbies.length === 0) {
        listEl.innerHTML = '<p style="text-align: center; padding: 20px;">No public lobbies found. Why not create one?</p>';
        return;
    }

    lobbies.forEach(lobby => {
        const item = document.createElement('div');
        item.className = 'public-lobby-item';
        
        const takenRoles = Object.entries(lobby.participants)
            .filter(([, p]) => p.status === 'connected')
            .map(([role]) => role);
        const playerCount = takenRoles.filter(r => r !== 'ref').length;

        item.innerHTML = `
            <div class="lobby-item-name">${lobby.hostName || 'Unnamed Lobby'}</div>
            <div class="lobby-item-players"><i class="fas fa-users"></i> ${playerCount}/2 Players</div>
            <div class="lobby-item-mode"><i class="fas fa-cogs"></i> ${lobby.draftLogic}</div>
            <button class="btn btn-primary btn-small join-from-browser-btn" data-lobby-code="${lobby.code}">Join</button>
        `;
        listEl.appendChild(item);
    });
}

function showRoleSelectionModal(lobby) {
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


// ======================
// CLIENT ACTIONS & EVENT HANDLERS
// ======================
function toggleIDSelection(player, id) {
    sendMessage({ type: 'rosterSelect', lobbyCode: state.lobbyCode, player, id });
}

function setPlayerRoster(player, roster) {
    sendMessage({ type: 'rosterSet', lobbyCode: state.lobbyCode, player, roster });
}

function hoverEgoToBan(egoId) {
    sendMessage({ type: 'draftHover', lobbyCode: state.lobbyCode, payload: { id: egoId, type: 'ego' } });
}

function hoverDraftID(id) {
    sendMessage({ type: 'draftHover', lobbyCode: state.lobbyCode, payload: { id, type: 'id' } });
}

function confirmSelection(type) {
     sendMessage({ type: 'draftConfirm', lobbyCode: state.lobbyCode, payload: { type } });
}

function toggleBuilderIdSelection(id) {
    const index = state.builderRoster.indexOf(id);
    if (index > -1) {
        state.builderRoster.splice(index, 1);
    } else {
        if (state.builderRoster.length < state.builderRosterSize) {
            state.builderRoster.push(id);
        } else {
            showNotification(`You can only select ${state.builderRosterSize} IDs.`);
        }
    }
    renderRosterBuilder();
}

// ======================
// STATE HANDLERS
// ======================
function handleLobbyCreated(message) {
    handleLobbyJoined(message);
}

function handleLobbyJoined(message) {
    if (rejoinTimeout) clearTimeout(rejoinTimeout);
    elements.roleSelectionModal.classList.add('hidden');
    elements.rejoinOverlay.style.display = 'none';

    state.lobbyCode = message.lobbyCode || message.code;
    state.userRole = message.role;
    state.rejoinToken = message.rejoinToken;

    if (state.rejoinToken) {
        localStorage.setItem('limbusDraftSession', JSON.stringify({
            lobbyCode: state.lobbyCode,
            userRole: state.userRole,
            rejoinToken: state.rejoinToken
        }));
    }

    handleStateUpdate(message);
    showNotification(`Joined lobby as ${state.participants[state.userRole].name}`);
}

function handleStateUpdate(message) {
    Object.assign(state.participants, message.state.participants);
    Object.assign(state.roster, message.state.roster);
    Object.assign(state.draft, message.state.draft);
    
    elements.lobbyCodeDisplay.textContent = state.lobbyCode;
    updateAllUIsFromState();
}

// ======================
// INITIALIZATION
// ======================
function setupFilterBar(barId, filterStateObject) {
    const bar = document.getElementById(barId);
    if (!bar) return;

    const update = () => {
        if (state.currentView === 'lobbyView') {
            if (state.draft.phase === 'roster') filterAndRenderRosterSelection();
            else updateDraftInstructions();
        } else if (state.currentView === 'rosterBuilderPage') {
            renderRosterBuilder();
        }
    };

    bar.addEventListener('input', (e) => {
        if (e.target.classList.contains('roster-search-input')) {
            filterStateObject.rosterSearch = e.target.value;
            update();
        }
    });
    bar.addEventListener('change', (e) => {
        const filterType = e.target.dataset.filter;
        if (filterType) {
            filterStateObject[filterType] = e.target.value;
            update();
        }
    });
    bar.addEventListener('click', (e) => {
        if (e.target.closest('.reset-filters-btn')) {
            Object.keys(filterStateObject).forEach(key => filterStateObject[key] = "");
            bar.querySelectorAll('input, select').forEach(el => el.value = "");
            update();
        }
    });
}

function setupEventListeners() {
    // Main Page
    elements.createLobbyBtn.addEventListener('click', () => {
        const options = {
            name: elements.playerNameInput.value.trim() || 'Referee',
            draftLogic: elements.draftLogicSelect.value,
            matchType: elements.matchTypeSelect.value,
            timerEnabled: elements.timerToggle.value === 'true',
            isPublic: elements.publicLobbyToggle.value === 'true',
            rosterSize: elements.rosterSizeSelect.value
        };
        sendMessage({ type: 'createLobby', options });
    });
    
    elements.goToBuilder.addEventListener('click', () => {
        state.builderSelectedSinner = "Yi Sang";
        switchView('rosterBuilderPage');
        renderRosterBuilder();
    });

    elements.showRulesBtn.addEventListener('click', () => elements.rulesModal.classList.remove('hidden'));
    elements.closeRulesBtn.addEventListener('click', () => elements.rulesModal.classList.add('hidden'));

    elements.joinTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            elements.joinTabs.forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.join-tab-content').forEach(content => content.classList.remove('active'));

            tab.classList.add('active');
            const tabName = tab.dataset.tab;
            const targetContentId = tabName === 'browse' ? 'browse-lobbies-tab' : 'code-join-tab';
            document.getElementById(targetContentId).classList.add('active');

            if (tabName === 'browse') {
                sendMessage({ type: 'getPublicLobbies' });
            }
        });
    });

    elements.refreshLobbiesBtn.addEventListener('click', () => sendMessage({ type: 'getPublicLobbies' }));

    elements.publicLobbiesList.addEventListener('click', (e) => {
        const joinBtn = e.target.closest('.join-from-browser-btn');
        if (joinBtn) {
            const lobbyCode = joinBtn.dataset.lobbyCode;
            sendMessage({ type: 'getLobbyInfo', lobbyCode });
        }
    });

    elements.enterLobbyByCode.addEventListener('click', () => {
        const lobbyCode = elements.lobbyCodeInput.value.trim().toUpperCase();
        if (!lobbyCode) return showNotification('Please enter a lobby code.', true);
        sendMessage({ type: 'getLobbyInfo', lobbyCode });
    });

    elements.closeRoleModalBtn.addEventListener('click', () => elements.roleSelectionModal.classList.add('hidden'));
    elements.confirmJoinBtn.addEventListener('click', () => {
        if (state.joinTarget.lobbyCode && state.joinTarget.role) {
            sendMessage({
                type: 'joinLobby',
                lobbyCode: state.joinTarget.lobbyCode,
                role: state.joinTarget.role,
                name: elements.playerNameInput.value.trim()
            });
        }
    });
    
    const cancelRejoinAction = () => {
        if (rejoinTimeout) clearTimeout(rejoinTimeout);
        localStorage.removeItem('limbusDraftSession');
        elements.rejoinOverlay.style.display = 'none';
        if (state.socket && state.socket.readyState !== WebSocket.CLOSED) {
            state.socket.close();
        }
        setTimeout(connectWebSocket, 100);
        showNotification("Rejoin attempt cancelled.");
    };
    elements.cancelRejoinBtn.addEventListener('click', cancelRejoinAction);

    const clearSessionAndReload = () => {
        localStorage.removeItem('limbusDraftSession');
        window.location.reload();
    };
    elements.backToMainLobby.addEventListener('click', clearSessionAndReload);
    elements.restartDraft.addEventListener('click', clearSessionAndReload);
    elements.backToMainBuilder.addEventListener('click', () => {
        state.lobbyCode = ''; 
        switchView('mainPage');
    });
    
    // Lobby Roster Controls
    ['p1', 'p2'].forEach(player => {
        elements[`${player}Random`].addEventListener('click', () => (state.userRole === player || state.userRole === 'ref') && sendMessage({ type: 'rosterRandomize', lobbyCode: state.lobbyCode, player }));
        elements[`${player}Clear`].addEventListener('click', () => (state.userRole === player || state.userRole === 'ref') && sendMessage({ type: 'rosterClear', lobbyCode: state.lobbyCode, player }));
        elements[`${player}Ready`].addEventListener('click', () => {
            if (state.userRole === player || state.userRole === 'ref') {
                 if (state.roster[player].length !== state.draft.rosterSize && !state.participants[player].ready) return showNotification(`Must select ${state.draft.rosterSize} IDs.`, true);
                sendMessage({ type: 'updateReady', lobbyCode: state.lobbyCode, player });
            }
        });
        elements[`${player}RosterLoad`].addEventListener('click', () => {
            if (state.userRole === player || state.userRole === 'ref') {
                const code = elements[`${player}RosterCodeInput`].value.trim();
                const roster = loadRosterFromCode(code);
                if (roster) {
                    if (roster.length !== state.draft.rosterSize) {
                        showNotification(`Roster code is for ${roster.length} IDs, but lobby requires ${state.draft.rosterSize}.`, true);
                        return;
                    }
                    setPlayerRoster(player, roster);
                    showNotification("Roster loaded successfully!");
                }
            }
        });
    });
    
    // Roster Builder Controls
    elements.builderRosterSizeSelector.addEventListener('click', (e) => {
        const button = e.target.closest('button');
        if (button && button.dataset.size) {
            const newSize = parseInt(button.dataset.size, 10);
            if (newSize !== state.builderRosterSize) {
                state.builderRosterSize = newSize;
                state.builderRoster = []; // Clear roster on size change
                elements.builderRosterSizeSelector.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                renderRosterBuilder();
                setupAdvancedRandomUI(); // Re-setup sliders with new roster size
            }
        }
    });
    elements.builderRandom.addEventListener('click', () => {
        const shuffled = [...state.builderMasterIDList].sort(() => 0.5 - Math.random());
        state.builderRoster = shuffled.slice(0, state.builderRosterSize).map(id => id.id);
        renderRosterBuilder();
    });
    elements.builderClear.addEventListener('click', () => {
        state.builderRoster = [];
        renderRosterBuilder();
    });
    elements.builderCopyCode.addEventListener('click', () => {
        const code = elements.builderRosterCodeDisplay.textContent;
        navigator.clipboard.writeText(code).then(() => {
            showNotification("Roster code copied to clipboard!");
        }, () => {
            showNotification("Failed to copy code.", true);
        });
    });
    elements.builderLoadCode.addEventListener('click', () => {
        const code = elements.builderLoadCodeInput.value.trim();
        const roster = loadRosterFromCode(code);
        if (roster) {
            state.builderRoster = roster;
            state.builderRosterSize = roster.length;
            
            elements.builderRosterSizeSelector.querySelectorAll('button').forEach(btn => {
                btn.classList.toggle('active', parseInt(btn.dataset.size) === state.builderRosterSize);
            });

            renderRosterBuilder();
            setupAdvancedRandomUI();
            showNotification(`Roster for ${roster.length} IDs loaded successfully!`);
        }
    });

    elements.toggleAdvancedRandom.addEventListener('click', () => {
        elements.advancedRandomOptions.classList.toggle('hidden');
    });
    elements.builderAdvancedRandom.addEventListener('click', generateAdvancedRandomRoster);


    // EGO Search
    elements.egoSearchInput.addEventListener('input', (e) => {
        state.egoSearch = e.target.value;
        renderEgoBanPhase();
    });

    // Draft controls
    elements.startCoinFlip.addEventListener('click', () => sendMessage({ type: 'startCoinFlip', lobbyCode: state.lobbyCode }));
    elements.goFirstBtn.addEventListener('click', () => sendMessage({ type: 'setTurnOrder', lobbyCode: state.lobbyCode, choice: 'first' }));
    elements.goSecondBtn.addEventListener('click', () => sendMessage({ type: 'setTurnOrder', lobbyCode: state.lobbyCode, choice: 'second' }));
    elements.confirmEgoBans.addEventListener('click', () => sendMessage({ type: 'draftControl', lobbyCode: state.lobbyCode, action: 'confirmEgoBans' }));
    elements.completeDraft.addEventListener('click', () => sendMessage({ type: 'draftControl', lobbyCode: state.lobbyCode, action: 'complete' }));
    elements.confirmSelectionId.addEventListener('click', () => confirmSelection('id'));
    elements.confirmSelectionEgo.addEventListener('click', () => confirmSelection('ego'));
    elements.refTimerControl.addEventListener('click', () => sendMessage({ type: 'timerControl', lobbyCode: state.lobbyCode, action: 'togglePause' }));
    
    // Hide/show lobby code
    elements.toggleCodeVisibility.addEventListener('click', () => {
        const codeDisplay = elements.lobbyCodeDisplay;
        const icon = elements.toggleCodeVisibility.querySelector('i');
        codeDisplay.classList.toggle('hidden');
        if (codeDisplay.classList.contains('hidden')) {
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        } else {
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }
    });

    // Tooltip Logic
    let tooltipTimer = null;

    const showTooltip = (element) => {
        if (document.getElementById('id-tooltip')) return;

        const idSlug = element.dataset.id;
        const idData = state.masterIDList.find(id => id.id === idSlug);
        if (!idData) return;

        const tooltip = document.createElement('div');
        tooltip.id = 'id-tooltip';
        tooltip.textContent = idData.name;
        document.body.appendChild(tooltip);

        const rect = element.getBoundingClientRect();
        let top = rect.top - tooltip.offsetHeight - 5;
        let left = rect.left + rect.width / 2 - tooltip.offsetWidth / 2;

        if (top < 0) {
            top = rect.bottom + 5;
        }
        if (left < 0) {
            left = 5;
        }
        if (left + tooltip.offsetWidth > window.innerWidth) {
            left = window.innerWidth - tooltip.offsetWidth - 5;
        }

        tooltip.style.top = `${top}px`;
        tooltip.style.left = `${left}px`;
        tooltip.style.opacity = '1';
    };

    const hideTooltip = () => {
        clearTimeout(tooltipTimer);
        const tooltip = document.getElementById('id-tooltip');
        if (tooltip) {
            tooltip.remove();
        }
    };

    document.body.addEventListener('mouseover', (e) => {
        const targetElement = e.target.closest('.compact-id-list .id-item, .final-picks .id-item, .final-bans .id-item, #draft-pool-container .id-item');
        if (targetElement) {
            clearTimeout(tooltipTimer);
            tooltipTimer = setTimeout(() => showTooltip(targetElement), 500);
        }
    });

    document.body.addEventListener('mouseout', (e) => {
        const targetElement = e.target.closest('.compact-id-list .id-item, .final-picks .id-item, .final-bans .id-item, #draft-pool-container .id-item');
        if (targetElement) {
            hideTooltip();
        }
    });

    window.addEventListener('scroll', hideTooltip, true);
}

function createFilterBarHTML(options = {}) {
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

function setupAdvancedRandomUI() {
    const container = elements.sinnerSlidersContainer;
    container.innerHTML = '';
    const rosterSize = state.builderRosterSize;

    const updateTotals = () => {
        let totalMin = 0, totalMax = 0;
        SINNER_ORDER.forEach(sinner => {
            totalMin += parseInt(document.getElementById(`slider-${sinner}-min`).value, 10);
            totalMax += parseInt(document.getElementById(`slider-${sinner}-max`).value, 10);
        });
        elements.totalMinDisplay.textContent = totalMin;
        elements.totalMaxDisplay.textContent = totalMax;
        elements.advancedRandomRosterSize.forEach(el => el.textContent = rosterSize);
        const possible = totalMin <= rosterSize && totalMax >= rosterSize;
        elements.builderAdvancedRandom.disabled = !possible;
        elements.advancedRandomSummary.style.color = possible ? 'var(--text)' : 'var(--primary)';
    };

    SINNER_ORDER.forEach(sinner => {
        const group = document.createElement('div');
        group.className = 'sinner-slider-group';
        const maxIDs = state.idsBySinner[sinner]?.length || 0;

        group.innerHTML = `
            <label>${sinner}</label>
            <div class="slider-container">
                <div class="slider-row">
                    <span>Min</span>
                    <input type="range" id="slider-${sinner}-min" min="0" max="${maxIDs}" value="0">
                    <span class="slider-value" id="slider-val-${sinner}-min">0</span>
                </div>
                <div class="slider-row">
                    <span>Max</span>
                    <input type="range" id="slider-${sinner}-max" min="0" max="${maxIDs}" value="${maxIDs}">
                    <span class="slider-value" id="slider-val-${sinner}-max">${maxIDs}</span>
                </div>
            </div>
        `;
        container.appendChild(group);

        const minSlider = document.getElementById(`slider-${sinner}-min`);
        const maxSlider = document.getElementById(`slider-${sinner}-max`);
        const minVal = document.getElementById(`slider-val-${sinner}-min`);
        const maxVal = document.getElementById(`slider-val-${sinner}-max`);

        minSlider.addEventListener('input', () => {
            minVal.textContent = minSlider.value;
            if (parseInt(minSlider.value) > parseInt(maxSlider.value)) {
                maxSlider.value = minSlider.value;
                maxVal.textContent = maxSlider.value;
            }
            updateTotals();
        });
        maxSlider.addEventListener('input', () => {
            maxVal.textContent = maxSlider.value;
             if (parseInt(maxSlider.value) < parseInt(minSlider.value)) {
                minSlider.value = maxSlider.value;
                minVal.textContent = minSlider.value;
            }
            updateTotals();
        });
    });
    updateTotals();
}

function generateAdvancedRandomRoster() {
    const constraints = {};
    let totalMin = 0;
    let totalMax = 0;
    const rosterSize = state.builderRosterSize;

    SINNER_ORDER.forEach(sinner => {
        const min = parseInt(document.getElementById(`slider-${sinner}-min`).value, 10);
        const max = parseInt(document.getElementById(`slider-${sinner}-max`).value, 10);
        constraints[sinner] = { min, max, available: state.idsBySinner[sinner] || [] };
        totalMin += min;
        totalMax += max;
    });

    if (totalMin > rosterSize || totalMax < rosterSize) {
        showNotification(`Constraints are impossible. Total Min must be <= ${rosterSize} and Total Max must be >= ${rosterSize}.`, true);
        return;
    }

    let roster = [];
    let availableIDs = [...state.builderMasterIDList];
    
    for (const sinner in constraints) {
        const { min, available } = constraints[sinner];
        if (available.length < min) {
            showNotification(`Not enough IDs for ${sinner} to meet the minimum of ${min}.`, true);
            return;
        }
        const shuffled = [...available].sort(() => 0.5 - Math.random());
        const toAdd = shuffled.slice(0, min);
        roster.push(...toAdd);
    }

    const rosterSlugs = new Set(roster.map(id => id.id));
    availableIDs = availableIDs.filter(id => !rosterSlugs.has(id.id));

    let attempts = 0;
    while (roster.length < rosterSize && attempts < 1000) {
        if (availableIDs.length === 0) break;

        const randomIndex = Math.floor(Math.random() * availableIDs.length);
        const candidate = availableIDs[randomIndex];
        
        const sinnerCount = roster.filter(id => id.sinner === candidate.sinner).length;
        if (sinnerCount < constraints[candidate.sinner].max) {
            roster.push(candidate);
            rosterSlugs.add(candidate.id);
            availableIDs.splice(randomIndex, 1);
        }
        attempts++;
    }

    if (roster.length === rosterSize) {
        state.builderRoster = roster.map(id => id.id);
        renderRosterBuilder();
        showNotification("Advanced random roster generated!");
    } else {
        showNotification("Could not generate a valid roster with the given constraints. Try relaxing them.", true);
    }
}

function cacheDOMElements() {
     elements = {
        // Pages
        mainPage: document.getElementById('main-page'),
        lobbyView: document.getElementById('lobby-view'),
        rosterBuilderPage: document.getElementById('roster-builder-page'),
        completedView: document.getElementById('completed-view'),
        rejoinOverlay: document.getElementById('rejoin-overlay'),
        cancelRejoinBtn: document.getElementById('cancel-rejoin-btn'),

        // Main Page
        createLobbyBtn: document.getElementById('create-lobby'),
        goToBuilder: document.getElementById('go-to-builder'),
        playerNameInput: document.getElementById('player-name'),
        draftLogicSelect: document.getElementById('draft-logic-select'),
        matchTypeSelect: document.getElementById('match-type-select'),
        timerToggle: document.getElementById('timer-toggle'),
        publicLobbyToggle: document.getElementById('public-lobby-toggle'),
        rosterSizeSelect: document.getElementById('roster-size-select'),
        showRulesBtn: document.getElementById('show-rules-btn'),
        joinTabs: document.querySelectorAll('.join-tab-btn'),
        refreshLobbiesBtn: document.getElementById('refresh-lobbies-btn'),
        publicLobbiesList: document.getElementById('public-lobbies-list'),
        lobbyCodeInput: document.getElementById('lobby-code-input'),
        enterLobbyByCode: document.getElementById('enter-lobby-by-code'),
        builderRosterDescription: document.getElementById('builder-roster-description'),

        // Modals
        rulesModal: document.getElementById('rules-modal'),
        closeRulesBtn: document.getElementById('close-rules-btn'),
        roleSelectionModal: document.getElementById('role-selection-modal'),
        closeRoleModalBtn: document.getElementById('close-role-modal-btn'),
        roleModalLobbyCode: document.getElementById('role-modal-lobby-code'),
        modalRoleOptions: document.getElementById('modal-role-options'),
        confirmJoinBtn: document.getElementById('confirm-join-btn'),

        // Shared
        backToMainLobby: document.getElementById('back-to-main-lobby'),
        backToMainBuilder: document.getElementById('back-to-main-builder'),
        connectionStatus: document.getElementById('connection-status'),
        notification: document.getElementById('notification'),
        
        // Lobby
        lobbyCodeDisplay: document.getElementById('lobby-code-display'),
        toggleCodeVisibility: document.getElementById('toggle-code-visibility'),
        participantsList: document.getElementById('participants-list'),
        phaseTimer: document.getElementById('phase-timer'),
        refTimerControl: document.getElementById('ref-timer-control'),
        draftStatusPanel: document.getElementById('draft-status-panel'),
        currentPhase: document.getElementById('current-phase'),
        draftActionDescription: document.getElementById('draft-action-description'),
        
        // Roster Phase (Lobby)
        rosterPhase: document.getElementById('roster-phase'),
        rosterPhaseTitle: document.getElementById('roster-phase-title'),
        p1Panel: document.getElementById('p1-panel'), p2Panel: document.getElementById('p2-panel'),
        p1Roster: document.getElementById('p1-roster'), p2Roster: document.getElementById('p2-roster'),
        p1Counter: document.getElementById('p1-counter'), p2Counter: document.getElementById('p2-counter'),
        p1RosterSize: document.getElementById('p1-roster-size'), p2RosterSize: document.getElementById('p2-roster-size'),
        p1Random: document.getElementById('p1-random'), p2Random: document.getElementById('p2-random'),
        p1Clear: document.getElementById('p1-clear'), p2Clear: document.getElementById('p2-clear'),
        p1Ready: document.getElementById('p1-ready'), p2Ready: document.getElementById('p2-ready'),
        p1Status: document.getElementById('p1-status'), p2Status: document.getElementById('p2-status'),
        p1NameDisplay: document.getElementById('p1-name-display'), p2NameDisplay: document.getElementById('p2-name-display'),
        p1RosterCodeInput: document.getElementById('p1-roster-code-input'), p2RosterCodeInput: document.getElementById('p2-roster-code-input'),
        p1RosterLoad: document.getElementById('p1-roster-load'), p2RosterLoad: document.getElementById('p2-roster-load'),
        startCoinFlip: document.getElementById('start-coin-flip'),

        // Roster Builder
        builderSinnerNav: document.getElementById('builder-sinner-nav'),
        builderIdPool: document.getElementById('builder-id-pool'),
        builderSelectedRoster: document.getElementById('builder-selected-roster'),
        builderCounter: document.getElementById('builder-counter'),
        builderRosterSize: document.getElementById('builder-roster-size'),
        builderRosterSizeSelector: document.getElementById('builder-roster-size-selector'),
        builderRandom: document.getElementById('builder-random'),
        builderClear: document.getElementById('builder-clear'),
        builderRosterCodeDisplay: document.getElementById('builder-roster-code-display'),
        builderCopyCode: document.getElementById('builder-copy-code'),
        builderLoadCodeInput: document.getElementById('builder-load-code-input'),
        builderLoadCode: document.getElementById('builder-load-code'),
        toggleAdvancedRandom: document.getElementById('toggle-advanced-random'),
        advancedRandomOptions: document.getElementById('advanced-random-options'),
        sinnerSlidersContainer: document.getElementById('sinner-sliders-container'),
        totalMinDisplay: document.getElementById('total-min-display'),
        totalMaxDisplay: document.getElementById('total-max-display'),
        advancedRandomRosterSize: document.querySelectorAll('.advanced-random-roster-size'),
        builderAdvancedRandom: document.getElementById('builder-advanced-random'),
        advancedRandomSummary: document.getElementById('advanced-random-summary'),

        // EGO Ban Phase
        egoBanPhase: document.getElementById('ego-ban-phase'),
        egoBanTitle: document.getElementById('ego-ban-title'),
        egoSearchInput: document.getElementById('ego-search-input'),
        egoBanContainer: document.getElementById('ego-ban-container'),
        confirmEgoBans: document.getElementById('confirm-ego-bans'),
        confirmSelectionEgo: document.getElementById('confirm-selection-ego'),
        opponentRosterDisplay: document.getElementById('opponent-roster-display'),
        opponentRosterTitle: document.getElementById('opponent-roster-title'),
        opponentRosterList: document.getElementById('opponent-roster-list'),
        currentPlayerEgoBans: document.getElementById('current-player-ego-bans'),
        egoBanCounter: document.getElementById('ego-ban-counter'),
        p1EgoBansPreview: document.getElementById('p1-ego-bans-preview'),

        // ID Draft Phase
        idDraftPhase: document.getElementById('id-draft-phase'),
        draftBannedEgosList: document.getElementById('draft-banned-egos-list'),
        completeDraft: document.getElementById('complete-draft'),
        p1DraftColumn: document.getElementById('p1-draft-column'), 
        p2DraftColumn: document.getElementById('p2-draft-column'),
        draftInteractionHub: document.getElementById('draft-interaction-hub'),
        p1DraftName: document.getElementById('p1-draft-name'), p2DraftName: document.getElementById('p2-draft-name'),
        p1DraftStatus: document.getElementById('p1-draft-status'), p2DraftStatus: document.getElementById('p2-draft-status'),
        draftPoolContainer: document.getElementById('draft-pool-container'),
        confirmSelectionId: document.getElementById('confirm-selection-id'),
        p1IdBans: document.getElementById('p1-id-bans'), p2IdBans: document.getElementById('p2-id-bans'),
        p1Picks: document.getElementById('p1-picks'), p2Picks: document.getElementById('p2-picks'),
        p1S2PicksContainer: document.getElementById('p1-s2-picks-container'), p2S2PicksContainer: document.getElementById('p2-s2-picks-container'),
        p1S2Picks: document.getElementById('p1-s2-picks'), p2S2Picks: document.getElementById('p2-s2-picks'),
        p1ReserveTime: document.getElementById('p1-reserve-time'),
        p2ReserveTime: document.getElementById('p2-reserve-time'),

        // Completed View
        finalBannedEgosList: document.getElementById('final-banned-egos-list'),
        restartDraft: document.getElementById('restart-draft'), 
        finalP1Name: document.getElementById('final-p1-name'), finalP2Name: document.getElementById('final-p2-name'),
        finalP1Picks: document.getElementById('final-p1-picks'),
        finalP2Picks: document.getElementById('final-p2-picks'),
        finalP1Bans: document.getElementById('final-p1-bans'),   
        finalP2Bans: document.getElementById('final-p2-bans'),
        finalP1S2PicksContainer: document.getElementById('final-p1-s2-picks-container'),
        finalP2S2PicksContainer: document.getElementById('final-p2-s2-picks-container'),
        finalP1S2Picks: document.getElementById('final-p1-s2-picks'),
        finalP2S2Picks: document.getElementById('final-p2-s2-picks'),

        // Coin Flip Modal
        coinFlipModal: document.getElementById('coin-flip-modal'),
        coinIcon: document.getElementById('coin-icon'),
        coinFlipStatus: document.getElementById('coin-flip-status'),
        turnChoiceButtons: document.getElementById('turn-choice-buttons'),
        goFirstBtn: document.getElementById('go-first-btn'),
        goSecondBtn: document.getElementById('go-second-btn'),
    };
    
    const missingElements = Object.keys(elements).filter(key => !elements[key]);
    if (missingElements.length > 0) {
        console.warn('Missing DOM elements:', missingElements);
    }
    console.log('DOM elements cached successfully. Missing count:', missingElements.length);
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded - Starting initialization');
    
    try {
        cacheDOMElements();

        document.getElementById('global-filter-bar-roster').innerHTML = createFilterBarHTML({ showSinnerFilter: true });
        document.getElementById('global-filter-bar-builder').innerHTML = createFilterBarHTML({ showSinnerFilter: false });
        document.getElementById('global-filter-bar-draft').innerHTML = createFilterBarHTML({ showSinnerFilter: true });
        setupFilterBar('global-filter-bar-roster', state.filters);
        setupFilterBar('global-filter-bar-builder', state.filters);
        setupFilterBar('global-filter-bar-draft', state.draftFilters);

        state.masterIDList = parseIDCSV(idCsvData);
        state.builderMasterIDList = state.masterIDList.filter(id => !id.name.includes('LCB Sinner'));
        state.masterEGOList = parseEGOData(egoData);

        state.idsBySinner = {};
        SINNER_ORDER.forEach(sinnerName => {
            state.idsBySinner[sinnerName] = state.builderMasterIDList.filter(id => id.sinner === sinnerName);
        });
        
        setupAdvancedRandomUI();
        setupEventListeners();
        connectWebSocket();
        switchView('mainPage');
        console.log('Initialization complete');
    } catch (error) {
        console.error('Error during initialization:', error);
        try {
            switchView('mainPage');
        } catch (fallbackError) {
            console.error('Even fallback failed:', fallbackError);
        }
    }
});
