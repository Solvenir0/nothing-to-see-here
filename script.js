// CONSTANTS & CONFIG
// ======================
const SINNER_ORDER = ["Yi Sang", "Faust", "Don Quixote", "Ryōshū", "Meursault", "Hong Lu", "Heathcliff", "Ishmael", "Rodion", "Sinclair", "Outis", "Gregor"];
const zayinBanExceptions = [
    "Bygone Days (Yi Sang)",
    "Soda (Ryōshū)",
    "Holiday (Heathcliff)",
    "Hundred-Footed Death Maggot [蝍蛆殺] (Ishmael)",
    "Cavernous Wailing (Sinclair)",
    "Legerdemain (Gregor)"
];

// Timing constants (in milliseconds)
const TIMING = {
    NOTIFICATION_HIDE_DELAY: 3000,
    CONNECTION_ERROR_DELAY: 5000,
    RECONNECT_ATTEMPT_DELAY: 10000,
    WEBSOCKET_RETRY_DELAY: 100,
    TOOLTIP_SHOW_DELAY: 500,
    TIMER_UPDATE_INTERVAL: 1000,
    KEEP_ALIVE_INTERVAL: 4 * 60 * 1000  // 4 minutes
};

// Game configuration constants
const GAME_CONFIG = {
    DEFAULT_RESERVE_TIME: 120,  // seconds
    SECTION1_ROSTER_SIZE: 42,
    ALL_SECTIONS_ROSTER_SIZE: 72,
    USER_ID_LENGTH: 9,
    USER_ID_START_POS: 2,
    MAX_GENERATION_ATTEMPTS: 1000
};
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
        p1: { name: "Player 1", status: "disconnected", ready: false, reserveTime: GAME_CONFIG.DEFAULT_RESERVE_TIME },
        p2: { name: "Player 2", status: "disconnected", ready: false, reserveTime: GAME_CONFIG.DEFAULT_RESERVE_TIME },
        ref: { name: "Referee", status: "disconnected" }
    },
    roster: { p1: [], p2: [] },
    builderRoster: [],
    builderRosterSize: GAME_CONFIG.SECTION1_ROSTER_SIZE,
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
        history: [],
        hovered: { p1: null, p2: null },
        banPools: { p1: [], p2: [] },
        draftLogic: '1-2-2',
        matchType: 'section1',
        rosterSize: GAME_CONFIG.SECTION1_ROSTER_SIZE,
        egoBanSteps: 10,
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
    keepAliveInterval: null,
    lastCountdownSecond: null, // Track last played countdown second to prevent duplicates
    socket: null,
    joinTarget: {
        lobbyCode: null,
        role: null,
    }
};

let elements = {};

// ======================
// DOM ELEMENT MANAGEMENT
// ======================
/**
 * Helper function to get reserve time element for a specific role
 * @param {string} role - Player role (p1, p2)
 * @returns {HTMLElement|null} The reserve time element
 */
function getReserveTimeElement(role) {
    const elementKey = `${role}ReserveTime`;
    if (!elements[elementKey]) {
        elements[elementKey] = document.getElementById(`${role}-reserve-time`);
    }
    return elements[elementKey];
}

/**
 * Helper function to get slider elements for advanced random generation
 * @param {string} sinner - Sinner name
 * @returns {object} Object containing slider elements
 */
function getSliderElements(sinner) {
    const cacheKey = `sliders_${sinner.replace(/\s+/g, '_')}`;
    if (!elements[cacheKey]) {
        elements[cacheKey] = {
            minSlider: document.getElementById(`slider-${sinner}-min`),
            maxSlider: document.getElementById(`slider-${sinner}-max`),
            minVal: document.getElementById(`slider-val-${sinner}-min`),
            maxVal: document.getElementById(`slider-val-${sinner}-max`)
        };
    }
    return elements[cacheKey];
}

/**
 * Helper function to manage tooltip element
 * @returns {HTMLElement} The tooltip element
 */
function getTooltipElement() {
    if (!elements.idTooltip) {
        elements.idTooltip = document.getElementById('id-tooltip');
    }
    return elements.idTooltip;
}

/**
 * Clear cached dynamic elements when they're removed from DOM
 */
function clearDynamicElementCache() {
    elements.idTooltip = null;
    // Clear any slider caches if needed
    Object.keys(elements).forEach(key => {
        if (key.startsWith('sliders_')) {
            delete elements[key];
        }
    });
}

// ======================
// UTILITY & CORE
// ======================
function generateUserId() {
    return 'user-' + Math.random().toString(36).substr(GAME_CONFIG.USER_ID_START_POS, GAME_CONFIG.USER_ID_LENGTH);
}

function showNotification(text, isError = false) {
    elements.notification.textContent = text;
    elements.notification.style.background = isError ? 'var(--disconnected)' : 'var(--primary)';
    elements.notification.classList.add('show');
    setTimeout(() => { elements.notification.classList.remove('show'); }, TIMING.NOTIFICATION_HIDE_DELAY);
}

function showSideChangeNotification(oldRole, newRole) {
    const oldSide = oldRole === 'p1' ? 'LEFT' : 'RIGHT';
    const newSide = newRole === 'p1' ? 'LEFT' : 'RIGHT';
    const message = `Position Changed! You are now on the ${newSide} side (was ${oldSide})`;
    
    // Show special notification with different styling
    elements.notification.innerHTML = `<i class="fas fa-exchange-alt"></i> ${message}`;
    elements.notification.style.background = 'var(--warning)';
    elements.notification.style.fontWeight = 'bold';
    elements.notification.classList.add('show');
    
    // Keep it visible longer for side changes
    setTimeout(() => { 
        elements.notification.classList.remove('show'); 
        elements.notification.style.fontWeight = ''; // Reset
    }, TIMING.CONNECTION_ERROR_DELAY);
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
// KEEP-ALIVE SYSTEM
// ======================
function startKeepAlive() {
    if (state.keepAliveInterval) return; // Already running
    
    console.log('Starting keep-alive system for active draft phases');
    
    // Send keep-alive every 4 minutes (Render free tier sleeps after ~15 min of inactivity)
    state.keepAliveInterval = setInterval(() => {
        if (shouldSendKeepAlive()) {
            console.log('Sending keep-alive message to prevent server sleep');
            sendMessage({ type: 'keepAlive', lobbyCode: state.lobbyCode });
        }
    }, TIMING.KEEP_ALIVE_INTERVAL);
}

function stopKeepAlive() {
    if (state.keepAliveInterval) {
        console.log('Stopping keep-alive system');
        clearInterval(state.keepAliveInterval);
        state.keepAliveInterval = null;
    }
}

function shouldSendKeepAlive() {
    // Only send keep-alive during active draft phases to prevent sleep
    if (!state.lobbyCode || !state.socket || state.socket.readyState !== WebSocket.OPEN) {
        return false;
    }
    
    // Active draft phases that need keep-alive
    const activeDraftPhases = ['coinFlip', 'egoBan', 'ban', 'pick', 'midBan', 'pick2', 'pick_s2'];
    return activeDraftPhases.includes(state.draft.phase);
}

// ======================
// INPUT VALIDATION HELPERS
// ======================
function validateAndTrimInput(input, fieldName) {
    const trimmed = input.trim();
    if (!trimmed) {
        showNotification(`Please enter a ${fieldName}.`, true);
        return null;
    }
    return trimmed;
}

function validateRosterSize(roster, requiredSize, action = 'proceed') {
    if (roster.length !== requiredSize) {
        showNotification(`Must select ${requiredSize} IDs to ${action}.`, true);
        return false;
    }
    return true;
}

function validateRosterCodeSize(rosterCode, requiredSize) {
    if (!rosterCode) {
        showNotification('Please enter a roster code.', true);
        return false;
    }
    
    const roster = loadRosterFromCode(rosterCode);
    if (!roster) {
        return false; // loadRosterFromCode already shows error notification
    }
    
    if (roster.length !== requiredSize) {
        showNotification(`Roster code is for ${roster.length} IDs, but lobby requires ${requiredSize}.`, true);
        return false;
    }
    
    return roster;
}

function validateUserPermission(userRole, targetRole) {
    return userRole === targetRole || userRole === 'ref';
}

// ======================
// DEBOUNCING UTILITY
// ======================
function createDebounceFunction(func, delay) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
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
        
        try {
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
                        try {
                            localStorage.removeItem('limbusDraftSession');
                        } catch (storageError) {
                            console.error('Failed to clear session storage:', storageError);
                        }
                        showNotification("Failed to rejoin lobby. Session cleared.", true);
                    }
                }, TIMING.RECONNECT_ATTEMPT_DELAY);
            }
        } catch (error) {
            console.error('Failed to parse session storage:', error);
            try {
                localStorage.removeItem('limbusDraftSession');
            } catch (storageError) {
                console.error('Failed to clear corrupted session storage:', storageError);
            }
        }
    };
    state.socket.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            handleServerMessage(message);
        } catch (error) {
            console.error('Failed to parse WebSocket message:', error, 'Raw data:', event.data);
            showNotification('Received invalid message from server', true);
        }
    };
    state.socket.onclose = () => {
        elements.connectionStatus.className = 'connection-status';
        elements.connectionStatus.innerHTML = '<i class="fas fa-plug"></i> <span>Disconnected</span>';
        if (state.timerInterval) clearInterval(state.timerInterval);
        state.lastCountdownSecond = null; // Reset countdown tracking on disconnect
        stopKeepAlive(); // Stop keep-alive when connection is lost
    };
    state.socket.onerror = (error) => console.error('WebSocket error:', error);
}

function sendMessage(message) {
    if (state.socket && state.socket.readyState === WebSocket.OPEN) {
        try {
            state.socket.send(JSON.stringify(message));
        } catch (error) {
            console.error('Failed to send WebSocket message:', error, 'Message:', message);
            showNotification('Failed to send message to server', true);
        }
    } else {
        console.warn('Cannot send message: WebSocket is not connected', message);
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
                
                try {
                    const session = JSON.parse(localStorage.getItem('limbusDraftSession'));
                    if (session) {
                        session.userRole = message.newRole;
                        localStorage.setItem('limbusDraftSession', JSON.stringify(session));
                        console.log('Updated session storage with new role.');
                    }
                } catch (error) {
                    console.error('Failed to update session storage with new role:', error);
                }
            }
            handleStateUpdate(message);
            break;
        case 'lobbyInfo': showRoleSelectionModal(message.lobby); break;
        case 'notification': showNotification(message.text); break;
        case 'error':
            showNotification(`Error: ${message.message}`, true);
            if (message.message.includes('rejoin') || message.message.includes('Clearing session')) {
                try {
                    localStorage.removeItem('limbusDraftSession');
                } catch (storageError) {
                    console.error('Failed to clear session storage on error:', storageError);
                }
                elements.rejoinOverlay.style.display = 'none';
                if (rejoinTimeout) clearTimeout(rejoinTimeout);
            }
            break;
        case 'keepAliveAck':
            // Server acknowledged keep-alive, no action needed
            console.log('Keep-alive acknowledged by server');
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
    let html = `<img class="id-icon" src="/uploads/${idData.imageFile}" alt="${idData.name}"><div class="id-name">${idData.name}</div>`;
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
        co
