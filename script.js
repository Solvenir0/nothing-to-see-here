// ======================
// APPLICATION STATE
// ======================
const state = {
    currentView: "main", // "main" or "lobby"
    lobbyCode: "",
    version: 0, // For synchronization
    userId: generateUserId(),
    userRole: "",
    participants: {
        p1: { name: "Player 1", status: "disconnected", ready: false },
        p2: { name: "Player 2", status: "disconnected", ready: false },
        ref: { name: "Referee", status: "disconnected" }
    },
    roster: {
        p1: [],
        p2: []
    },
    masterIDList: [],
    draft: {
        phase: "roster", // "roster", "ban", "pick", "complete"
        step: 0, // Current step in phase
        currentPlayer: "", // Player whose turn it is
        action: "", // Current action type
        actionCount: 0, // How many actions to take
        available: {
            p1: [], // IDs available for picking
            p2: []  // IDs available for banning
        },
        idBans: {
            p1: [], // IDs banned by P1
            p2: []  // IDs banned by P2
        },
        picks: {
            p1: [], // IDs picked by P1
            p2: []  // IDs picked by P2
        }
    },
    filters: {
        sinner: "",
        sinAffinity: "",
        keyword: ""
    },
    search: {
        p1: "",
        p2: ""
    },
    timer: 0,
    timerInterval: null,
    serverType: "local", // "remote" or "local"
    socket: null
};

// ======================
// DOM ELEMENTS
// ======================
const elements = {
    mainPage: document.getElementById('main-page'),
    lobbyView: document.getElementById('lobby-view'),
    lobbyAccessForm: document.getElementById('lobby-access-form'),
    createLobbyBtn: document.getElementById('create-lobby'),
    joinLobbyBtn: document.getElementById('join-lobby'),
    enterLobbyBtn: document.getElementById('enter-lobby'),
    backToMainBtn: document.getElementById('back-to-main'),
    lobbyCodeInput: document.getElementById('lobby-code'),
    lobbyCodeDisplay: document.getElementById('lobby-code-display'),
    participantsList: document.getElementById('participants-list'),
    roleOptions: document.querySelectorAll('.role-option'),
    sinnerFilter: document.getElementById('sinner-filter'),
    sinAffinityFilter: document.getElementById('sin-affinity-filter'),
    keywordFilter: document.getElementById('keyword-filter'),
    resetFilters: document.getElementById('reset-filters'),
    p1Roster: document.getElementById('p1-roster'),
    p2Roster: document.getElementById('p2-roster'),
    p1Counter: document.getElementById('p1-counter'),
    p2Counter: document.getElementById('p2-counter'),
    p1Random: document.getElementById('p1-random'),
    p2Random: document.getElementById('p2-random'),
    p1Clear: document.getElementById('p1-clear'),
    p2Clear: document.getElementById('p2-clear'),
    p1Ready: document.getElementById('p1-ready'),
    p2Ready: document.getElementById('p2-ready'),
    p1Status: document.getElementById('p1-status'),
    p2Status: document.getElementById('p2-status'),
    startDraft: document.getElementById('start-draft'),
    nextPhase: document.getElementById('next-phase'),
    completeDraft: document.getElementById('complete-draft'),
    phaseTimer: document.getElementById('phase-timer'),
    p1IdBans: document.getElementById('p1-id-bans'),
    p2IdBans: document.getElementById('p2-id-bans'),
    p1Picks: document.getElementById('p1-picks'),
    p2Picks: document.getElementById('p2-picks'),
    draftInstructions: document.getElementById('draft-instructions'),
    draftActionDescription: document.getElementById('draft-action-description'),
    draftControls: document.getElementById('draft-controls'),
    p1DraftStatus: document.getElementById('p1-draft-status'),
    p2DraftStatus: document.getElementById('p2-draft-status'),
    connectionStatus: document.getElementById('connection-status'),
    notification: document.getElementById('notification'),
    serverSelection: document.getElementById('server-selection'),
    serverOptions: document.querySelectorAll('.server-option'),
    p1SearchInput: document.getElementById('p1-search-input'),
    p2SearchInput: document.getElementById('p2-search-input'),
    p1SearchBar: document.getElementById('p1-search-bar'),
    p2SearchBar: document.getElementById('p2-search-bar')
};

// ======================
// UTILITY FUNCTIONS
// ======================
function generateUserId() {
    return 'user-' + Math.random().toString(36).substr(2, 9);
}

function generateLobbyCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function showNotification(text) {
    elements.notification.textContent = text;
    elements.notification.classList.add('show');
    setTimeout(() => {
        elements.notification.classList.remove('show');
    }, 3000);
}

function saveLocalState() {
    if (state.serverType !== 'local') return;
    if (!state.lobbyCode) return;
    
    state.version++;
    const savedState = {
        participants: state.participants,
        roster: state.roster,
        draft: state.draft,
        version: state.version
    };
    
    localStorage.setItem(`limbus-draft-${state.lobbyCode}`, JSON.stringify(savedState));
    console.log("Saved state to localStorage:", savedState);
}

function loadLocalState() {
    if (state.serverType !== 'local') return;
    
    const savedState = localStorage.getItem(`limbus-draft-${state.lobbyCode}`);
    if (savedState) {
        const parsed = JSON.parse(savedState);
        console.log("Loaded state from localStorage:", parsed);
        
        // Only update if the version is newer
        if (parsed.version > state.version) {
            state.participants = parsed.participants;
            state.roster = parsed.roster;
            state.draft = parsed.draft;
            state.version = parsed.version;
            return true;
        }
    }
    return false;
}

function parseCSV(csv) {
    const lines = csv.split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    const result = [];
    
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const values = [];
        let current = '';
        let inQuotes = false;
        
        for (let char of line) {
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current.trim());
        
        if (values.length !== headers.length) continue;
        
        const obj = {};
        headers.forEach((header, idx) => {
            obj[header] = values[idx];
        });
        
        // Extract sinner name from the ID name
        const sinnerMatch = obj.Name.match(/(Yi Sang|Faust|Don Quixote|Ryōshū|Meursault|Hong Lu|Heathcliff|Ishmael|Rodion|Sinclair|Outis|Gregor)/);
        obj.Sinner = sinnerMatch ? sinnerMatch[0] : "Unknown";
        
        // Split keywords into an array
        obj.Keywords = obj.Keywords ? obj.Keywords.split(',').map(k => k.trim()) : [];
        
        // Split sin affinities into an array
        obj.SinAffinities = obj.SinAffinities ? obj.SinAffinities.split(',').map(s => s.trim()) : [];
        
        result.push({
            id: i,
            name: obj.Name,
            keywords: obj.Keywords,
            sinAffinities: obj.SinAffinities,
            rarity: obj.Rarity,
            imageUrl: obj.ImageURL,
            sinner: obj.Sinner,
            selected: false
        });
    }
    
    return result;
}

// ======================
// SOCKET COMMUNICATION
// ======================
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;

function connectWebSocket() {
    if (state.serverType === "local") {
        elements.connectionStatus.innerHTML = '<i class="fas fa-laptop"></i> <span>Local Testing Mode</span>';
        elements.connectionStatus.classList.remove('disconnected', 'connected');
        elements.connectionStatus.classList.add('offline');
        showNotification("Using local testing mode - no server connection needed");
        return;
    }
    
    // Using a WebSocket server hosted on Glitch for demonstration
    const wsServerUrl = "wss://limbus-draft-server.glitch.me";
    
    try {
        if (state.socket) {
            state.socket.close();
        }
        
        state.socket = new WebSocket(wsServerUrl);
        
        state.socket.addEventListener('open', () => {
            elements.connectionStatus.innerHTML = '<i class="fas fa-plug"></i> <span>Connected to server</span>';
            elements.connectionStatus.classList.add('connected');
            elements.connectionStatus.classList.remove('disconnected');
            reconnectAttempts = 0;
            
            // If we have a lobby code, try to rejoin
            if (state.lobbyCode) {
                sendMessage({
                    type: 'rejoinLobby',
                    lobbyCode: state.lobbyCode,
                    userId: state.userId
                });
            }
        });
        
        state.socket.addEventListener('message', (event) => {
            const message = JSON.parse(event.data);
            handleServerMessage(message);
        });
        
        state.socket.addEventListener('close', () => {
            elements.connectionStatus.innerHTML = '<i class="fas fa-plug"></i> <span>Disconnected - Reconnecting...</span>';
            elements.connectionStatus.classList.remove('connected');
            elements.connectionStatus.classList.add('disconnected');
            
            // Attempt to reconnect
            if (reconnectAttempts < maxReconnectAttempts) {
                reconnectAttempts++;
                setTimeout(connectWebSocket, 2000);
            }
        });
        
        state.socket.addEventListener('error', (error) => {
            console.error('WebSocket error:', error);
            elements.connectionStatus.innerHTML = '<i class="fas fa-plug"></i> <span>Connection Error</span>';
            elements.connectionStatus.classList.remove('connected');
            elements.connectionStatus.classList.add('disconnected');
            
            // Offer to switch to local mode
            showNotification("Server connection failed. Switching to local testing mode.");
            state.serverType = "local";
            document.querySelector('.server-option[data-server="local"]').classList.add('selected');
            document.querySelector('.server-option[data-server="remote"]').classList.remove('selected');
            connectWebSocket();
        });
    } catch (error) {
        console.error("WebSocket initialization error:", error);
        showNotification("WebSocket not supported. Using local testing mode.");
        state.serverType = "local";
        document.querySelector('.server-option[data-server="local"]').classList.add('selected');
        document.querySelector('.server-option[data-server="remote"]').classList.remove('selected');
        connectWebSocket();
    }
}

function sendMessage(message) {
    if (state.serverType === "local") {
        // Simulate server responses in local mode
        handleLocalMessage(message);
        return;
    }
    
    if (state.socket && state.socket.readyState === WebSocket.OPEN) {
        state.socket.send(JSON.stringify(message));
    } else {
        console.error("WebSocket not connected");
    }
}

function handleServerMessage(message) {
    switch (message.type) {
        case 'lobbyCreated':
            handleLobbyCreated(message);
            break;
        case 'lobbyJoined':
            handleLobbyJoined(message);
            break;
        case 'stateUpdate':
            handleStateUpdate(message);
            break;
        case 'participantUpdate':
            handleParticipantUpdate(message);
            break;
        case 'rosterUpdate':
            handleRosterUpdate(message);
            break;
        case 'readyUpdate':
            handleReadyUpdate(message);
            break;
        case 'draftAction':
            handleDraftAction(message);
            break;
        case 'notification':
            showNotification(message.text);
            break;
        case 'error':
            console.error('Server error:', message.message);
            showNotification(`Error: ${message.message}`);
            break;
    }
}

function handleLocalMessage(message) {
    switch (message.type) {
        case 'createLobby':
            // Simulate lobby creation
            setTimeout(() => {
                handleLobbyCreated({
                    code: generateLobbyCode()
                });
            }, 500);
            break;
        case 'joinLobby':
            // Simulate joining lobby
            setTimeout(() => {
                handleLobbyJoined({
                    lobbyCode: message.lobbyCode,
                    role: message.role,
                    participants: {
                        p1: { name: "Player 1", status: "connected", ready: false },
                        p2: { name: "Player 2", status: "connected", ready: false },
                        ref: { name: "Referee", status: "connected" }
                    }
                });
            }, 500);
            break;
        case 'updateRoster':
            // Simulate roster update
            setTimeout(() => {
                handleRosterUpdate({
                    player: message.player,
                    roster: message.roster
                });
            }, 200);
            break;
        case 'updateReady':
            setTimeout(() => {
                handleReadyUpdate({
                    player: message.player,
                    ready: message.ready
                });
            }, 200);
            break;
        case 'draftAction':
            // Simulate draft actions
            setTimeout(() => {
                handleDraftAction({
                    action: message.action,
                    draft: state.draft
                });
            }, 300);
            break;
        case 'leaveLobby':
            // Do nothing in local mode
            break;
    } 
}

// ======================
// UI RENDERING
// ======================
function updateParticipantsList() {
    elements.participantsList.innerHTML = '';
    
    // Add Player 1
    const p1 = document.createElement('div');
    p1.className = 'participant';
    if (state.userRole === 'p1') p1.classList.add('current-user');
    p1.innerHTML = `<i class="fas fa-user"></i> ${state.participants.p1.name}`;
    if (state.participants.p1.status === 'connected') {
        p1.innerHTML += state.participants.p1.ready 
            ? ' <i class="fas fa-check-circle" style="color:var(--ready);"></i>'
            : ' <i class="fas fa-check-circle" style="color:var(--connected);"></i>';
    } else {
        p1.innerHTML += ' <i class="fas fa-times-circle" style="color:var(--disconnected);"></i>';
    }
    elements.participantsList.appendChild(p1);
    
    // Add Player 2
    const p2 = document.createElement('div');
    p2.className = 'participant';
    if (state.userRole === 'p2') p2.classList.add('current-user');
    p2.innerHTML = `<i class="fas fa-user"></i> ${state.participants.p2.name}`;
    if (state.participants.p2.status === 'connected') {
        p2.innerHTML += state.participants.p2.ready 
            ? ' <i class="fas fa-check-circle" style="color:var(--ready);"></i>'
            : ' <i class="fas fa-check-circle" style="color:var(--connected);"></i>';
    } else {
        p2.innerHTML += ' <i class="fas fa-times-circle" style="color:var(--disconnected);"></i>';
    }
    elements.participantsList.appendChild(p2);
    
    // Add Referee
    const ref = document.createElement('div');
    ref.className = 'participant';
    if (state.userRole === 'ref') ref.classList.add('current-user');
    ref.innerHTML = `<i class="fas fa-star"></i> ${state.participants.ref.name}`;
    if (state.participants.ref.status === 'connected') {
        ref.innerHTML += ' <i class="fas fa-check-circle" style="color:var(--connected);"></i>';
    } else {
        ref.innerHTML += ' <i class="fas fa-times-circle" style="color:var(--disconnected);"></i>';
    }
    elements.participantsList.appendChild(ref);
}

function filterIDs(player) {
    let idList = [];

    if (document.body.classList.contains('draft-started')) {
        // Show only selected IDs for both players and referee
        idList = state.roster[player].map(id => {
            return state.masterIDList.find(item => item.id === id);
        }).filter(Boolean);
    } else {
        // During roster selection, show the full list
        idList = state.masterIDList;
    }
    
    return idList.filter(idData => {
        const id = idData.id || idData;
        const fullData = typeof id === 'number' ? state.masterIDList.find(item => item.id === id) : idData;
        
        // Filter by sinner
        if (state.filters.sinner && fullData.sinner !== state.filters.sinner) {
            return false;
        }
        
        // Filter by sin affinity
        if (state.filters.sinAffinity && !fullData.sinAffinities.includes(state.filters.sinAffinity)) {
            return false;
        }
        
        // Filter by keyword
        if (state.filters.keyword && !fullData.keywords.includes(state.filters.keyword)) {
            return false;
        }
        
        // Filter by search term
        const searchTerm = state.search[player] || '';
        if (searchTerm && !fullData.name.toLowerCase().includes(searchTerm.toLowerCase())) {
            return false;
        }
        
        return true;
    });
}

function renderIDList(container, player) {
    container.innerHTML = '';
    
    // Only show selected IDs after draft starts
    if (document.body.classList.contains('draft-started')) {
        // For referee, show all selected IDs
        if (state.userRole === 'ref') {
            state.roster[player].forEach(id => {
                const idData = state.masterIDList.find(item => item.id === id);
                if (!idData) return;
                
                const idElement = document.createElement('div');
                idElement.className = 'id-item selected';
                idElement.innerHTML = `
                    <div class="id-icon" style="background-image: url(${idData.imageUrl})"></div>
                    <div class="id-name">${idData.name}</div>
                `;
                container.appendChild(idElement);
            });
            return;
        }
        
        // For players, show opponent's roster for bans or own for picks
        const filteredIDs = filterIDs(player);
        
        if (filteredIDs.length === 0) {
            container.innerHTML = '<div class="empty-roster">No IDs match the current filters</div>';
            return;
        }
        
        filteredIDs.forEach(id => {
            const idData = typeof id === 'number' ? 
                state.masterIDList.find(item => item.id === id) : id;
            
            const idElement = document.createElement('div');
            idElement.className = 'id-item';
            idElement.innerHTML = `
                <div class="id-icon" style="background-image: url(${idData.imageUrl})"></div>
                <div class="id-name">${idData.name}</div>
            `;
            
            // Only allow selection if user is referee or the current player
            if (state.userRole === state.draft.currentPlayer || state.userRole === 'ref') {
                idElement.addEventListener('click', () => {
                    if (state.draft.action === "ban") {
                        banID(player, idData.id);
                    } else if (state.draft.action === "pick") {
                        pickID(player, idData.id);
                    }
                });
            }
            
            container.appendChild(idElement);
        });
        return;
    }
    
    // Normal roster selection mode
    const filteredIDs = filterIDs(player);

    if (filteredIDs.length === 0) {
        container.innerHTML = '<div class="empty-roster">No IDs match the current filters</div>';
        return;
    }
    
    filteredIDs.forEach(idData => {
        const idElement = document.createElement('div');
        idElement.className = `id-item ${state.roster[player].includes(idData.id) ? 'selected' : ''}`;
        idElement.innerHTML = `
            <div class="id-icon" style="background-image: url(${idData.imageUrl})"></div>
            <div class="id-name">${idData.name}</div>
        `;
        
        // Only allow selection if user is referee or the player for this panel
        if (state.userRole === player || state.userRole === 'ref') {
            idElement.addEventListener('click', () => {
                toggleIDSelection(player, idData.id);
            });
        }
        
        container.appendChild(idElement);
    });
}

function updateRosterCounter(player) {
    const count = state.roster[player].length;
    const counter = player === 'p1' ? elements.p1Counter : elements.p2Counter;
    counter.textContent = count;
    
    // Update UI for counter element
    if (counter) {
        counter.textContent = count;
    }
}

function updateDraftUI() {
    // Player 1
    elements.p1IdBans.innerHTML = state.draft.idBans.p1.map(id => {
        const idData = state.masterIDList.find(item => item.id === id);
        if (!idData) return '';
        return `<div class="id-item">
            <div class="id-icon" style="background-image: url(${idData.imageUrl})"></div>
            <div class="id-name">${idData.name}</div>
        </div>`;
    }).join('');
    
    elements.p1Picks.innerHTML = state.draft.picks.p1.map(id => {
        const idData = state.masterIDList.find(item => item.id === id);
        if (!idData) return '';
        return `<div class="id-item">
            <div class="id-icon" style="background-image: url(${idData.imageUrl})"></div>
            <div class="id-name">${idData.name}</div>
        </div>`;
    }).join('');
    
    // Player 2
    elements.p2IdBans.innerHTML = state.draft.idBans.p2.map(id => {
        const idData = state.masterIDList.find(item => item.id === id);
        if (!idData) return '';
        return `<div class="id-item">
            <div class="id-icon" style="background-image: url(${idData.imageUrl})"></div>
            <div class="id-name">${idData.name}</div>
        </div>`;
    }).join('');
    
    elements.p2Picks.innerHTML = state.draft.picks.p2.map(id => {
        const idData = state.masterIDList.find(item => item.id === id);
        if (!idData) return '';
        return `<div class="id-item">
            <div class="id-icon" style="background-image: url(${idData.imageUrl})"></div>
            <div class="id-name">${idData.name}</div>
        </div>`;
    }).join('');
    
    // Update draft status
    updateDraftStatus();
}

function updateDraftStatus() {
    elements.p1DraftStatus.textContent = state.draft.phase === "roster" ? "Waiting" : 
        (state.draft.currentPlayer === "p1" ? "Drafting" : "Waiting");
    elements.p2DraftStatus.textContent = state.draft.phase === "roster" ? "Waiting" : 
        (state.draft.currentPlayer === "p2" ? "Drafting" : "Waiting");
        
    elements.p1DraftStatus.className = state.draft.currentPlayer === "p1" ? 
        "player-status status-drafting" : "player-status status-waiting";
    elements.p2DraftStatus.className = state.draft.currentPlayer === "p2" ? 
        "player-status status-drafting" : "player-status status-waiting";
         // Add active class to current player's panel
    document.querySelectorAll('.player-panel').forEach(panel => {
        panel.classList.remove('draft-active');
    });
    
    if (state.draft.currentPlayer) {
        document.getElementById(`${state.draft.currentPlayer}-roster`)
            .closest('.player-panel')
            .classList.add('draft-active');
    }
}

function updateReadyUI(player, isReady) {
    const button = document.getElementById(`${player}-ready`);
    const status = document.getElementById(`${player}-status`);
    
    if (button && status) {
        if (isReady) {
            button.innerHTML = '<i class="fas fa-times"></i> Unready';
            button.classList.add('btn-ready');
            status.textContent = 'Ready';
            status.className = 'player-status status-ready';
        } else {
            button.innerHTML = '<i class="fas fa-check"></i> Ready';
            button.classList.remove('btn-ready');
            status.textContent = 'Selecting';
            status.className = 'player-status status-waiting';
        }
    }
}

// ======================
// DRAFT LOGIC
// ======================
function toggleIDSelection(player, id) {
    const index = state.roster[player].indexOf(id);
    
    if (index === -1) {
        if (state.roster[player].length < 42) {
            state.roster[player].push(id);
        }
    } else {
        state.roster[player].splice(index, 1);
    }
    
    // Update UI
    renderIDList(player === 'p1' ? elements.p1Roster : elements.p2Roster, player);
    updateRosterCounter(player);
    
    // Send update to server
    sendMessage({
        type: 'updateRoster',
        lobbyCode: state.lobbyCode,
        userId: state.userId,
        player: player,
        roster: state.roster[player]
    });
    
    saveLocalState();
}

function randomizeRoster(player) {
    // Clear current roster
    state.roster[player] = [];
    
    // Select 42 random IDs
    const shuffled = [...state.masterIDList].sort(() => 0.5 - Math.random());
    for (let i = 0; i < 42 && i < shuffled.length; i++) {
        state.roster[player].push(shuffled[i].id);
    }
    
    // Update UI
    renderIDList(player === 'p1' ? elements.p1Roster : elements.p2Roster, player);
    updateRosterCounter(player);
    
    // Send update to server
    sendMessage({
        type: 'updateRoster',
        lobbyCode: state.lobbyCode,
        userId: state.userId,
        player: player,
        roster: state.roster[player]
    });
    
    saveLocalState();
}

function clearRoster(player) {
    state.roster[player] = [];
    
    // Update UI
    renderIDList(player === 'p1' ? elements.p1Roster : elements.p2Roster, player);
    updateRosterCounter(player);
    
    // Send update to server
    sendMessage({
        type: 'updateRoster',
        lobbyCode: state.lobbyCode,
        userId: state.userId,
        player: player,
        roster: state.roster[player]
    });
    
    saveLocalState();
}

function startTimer(seconds) {
    if (state.timerInterval) {
        clearInterval(state.timerInterval);
    }
    
    state.timer = seconds;
    
    function update() {
        const minutes = Math.floor(state.timer / 60);
        const seconds = state.timer % 60;
        elements.phaseTimer.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        if (state.timer <= 0) {
            clearInterval(state.timerInterval);
        }
    }
    
    update();
    
    state.timerInterval = setInterval(() => {
        state.timer--;
        update();
    }, 1000);
}

function banID(player, id) {
    const opponent = player === 'p1' ? 'p2' : 'p1';
    
    // Remove from opponent's roster
    const oppIndex = state.roster[opponent].indexOf(id);
    if (oppIndex !== -1) {
        state.roster[opponent].splice(oppIndex, 1);
    }
    
    // Remove from player's roster if they have it
    const playerIndex = state.roster[player].indexOf(id);
    if (playerIndex !== -1) {
        state.roster[player].splice(playerIndex, 1);
    }
    
    // Remove from available picks
    [player, opponent].forEach(p => {
        const availIndex = state.draft.available[p].indexOf(id);
        if (availIndex !== -1) {
            state.draft.available[p].splice(availIndex, 1);
        }
    });
    
    // Add to player's bans
    state.draft.idBans[player].push(id);
    
    // Update UI and state
    updateDraftUI();
    saveLocalState();
    
    // Reduce action count and check if phase is complete
    state.draft.actionCount--;
    
    if (state.draft.actionCount <= 0) {
        // Automatically move to next step
        nextPhase();
    } else {
        updateDraftInstructions();
    }
}

function pickID(player, id) {
    // Remove from player's available
    const index = state.draft.available[player].indexOf(id);
    if (index !== -1) {
        state.draft.available[player].splice(index, 1);
    }
    
    // Also remove from opponent's roster if they have it
    const opponent = player === 'p1' ? 'p2' : 'p1';
    const oppIndex = state.roster[opponent].indexOf(id);
    if (oppIndex !== -1) {
        state.roster[opponent].splice(oppIndex, 1);
        // Also remove from opponent's available picks
        const oppAvailIndex = state.draft.available[opponent].indexOf(id);
        if (oppAvailIndex !== -1) {
            state.draft.available[opponent].splice(oppAvailIndex, 1);
        }
    }
    
    // Add to player's picks
    state.draft.picks[player].push(id);
    
    // Update UI and state
    updateDraftUI();
    saveLocalState();
    
    // Reduce action count and check if phase is complete
    state.draft.actionCount--;
    
    if (state.draft.actionCount <= 0) {
        // Automatically move to next step
        nextPhase();
    } else {
        updateDraftInstructions();
    }
}

function startDraft() {
    document.body.classList.add('draft-started');
    state.draft.phase = "ban";
    state.draft.step = 0;
    state.draft.currentPlayer = "p1";
    state.draft.action = "ban";
    state.draft.actionCount = 1;  // Each ban is 1 ID at a time
    state.draft.available.p1 = [...state.roster.p1];
    state.draft.available.p2 = [...state.roster.p2];
    
    elements.draftInstructions.textContent = "Ban Phase - Step 1/8";
    startTimer(60);
    updateDraftUI();
    updateDraftInstructions();
    
    // Show search bars
    elements.p1SearchBar.style.display = 'block';
    elements.p2SearchBar.style.display = 'block';
    
    // Enable next phase button
    elements.nextPhase.disabled = false;
    
    saveLocalState();
}

function nextPhase() {
    switch (state.draft.phase) {
        case "ban":
            if (state.draft.step < 7) {
                state.draft.step++;
                state.draft.currentPlayer = state.draft.currentPlayer === "p1" ? "p2" : "p1";
                state.draft.action = "ban";
                state.draft.actionCount = 1;
                elements.draftInstructions.textContent = `Ban Phase - Step ${state.draft.step + 1}/8`;
            } else {
                state.draft.phase = "pick";
                state.draft.step = 0;
                state.draft.currentPlayer = "p1";
                state.draft.action = "pick";
                state.draft.actionCount = 1;  // P1 picks 1 ID
                elements.draftInstructions.textContent = "Pick Phase - Step 1/7";
            }
            break;
            
        case "pick":
            // Sequence: P1:1, P2:2, P1:2, P2:2, P1:2, P2:2, P1:1
            const pickSequence = [
                { player: 'p1', count: 1 },
                { player: 'p2', count: 2 },
                { player: 'p1', count: 2 },
                { player: 'p2', count: 2 },
                { player: 'p1', count: 2 },
                { player: 'p2', count: 2 },
                { player: 'p1', count: 1 }
            ];
            
            if (state.draft.step < pickSequence.length - 1) {
                state.draft.step++;
                const next = pickSequence[state.draft.step];
                state.draft.currentPlayer = next.player;
                state.draft.action = "pick";
                state.draft.actionCount = next.count;
                elements.draftInstructions.textContent = `Pick Phase - Step ${state.draft.step + 1}/7`;
            } else {
                state.draft.phase = "complete";
                elements.draftInstructions.textContent = "Draft Complete";
                // Hide search bars
                elements.p1SearchBar.style.display = 'none';
                elements.p2SearchBar.style.display = 'none';
                // Enable complete draft button
                elements.completeDraft.disabled = false;
            }
            break;
    }
    
    startTimer(60);
    updateDraftUI();
    updateDraftInstructions();
    saveLocalState();
}

function completeDraft() {
    state.draft.phase = "complete";
    elements.draftInstructions.textContent = "Draft Complete";
    updateDraftInstructions();
    saveLocalState();
}

function updateDraftInstructions() {
    let instructions = "";
    let actionDescription = "";
    
    switch (state.draft.phase) {
        case "roster":
            instructions = "Waiting for players to complete their rosters";
            break;
            
        case "ban":
            instructions = `Ban Phase - Step ${state.draft.step + 1}/8`;
            actionDescription = `${state.draft.currentPlayer === "p1" ? "Player 1" : "Player 2"} to ban 1 ID from opponent's roster`;
            break;
            
        case "pick":
            instructions = `Pick Phase - Step ${state.draft.step + 1}/7`;
            actionDescription = `${state.draft.currentPlayer === "p1" ? "Player 1" : "Player 2"} to pick ${state.draft.actionCount} ID(s) from their roster`;
            break;
            
        case "complete":
            instructions = "Draft Completed!";
            actionDescription = "All picks and bans are finalized";
            // Disable draft controls
            elements.startDraft.disabled = true;
            elements.nextPhase.disabled = true;
            elements.completeDraft.disabled = true;
            break;
    }
    
    elements.draftInstructions.textContent = instructions;
    elements.draftActionDescription.textContent = actionDescription;
    
    // Show appropriate roster
    renderIDList(elements.p1Roster, 'p1');
    renderIDList(elements.p2Roster, 'p2');
}

function checkDraftReadiness() {
    const p1Ready = state.participants.p1.ready;
    const p2Ready = state.participants.p2.ready;
    
    elements.startDraft.disabled = !(p1Ready && p2Ready);
    
    if (p1Ready && p2Ready) {
        showNotification("Both players are ready! Referee can start the draft");
    }
}

// ======================
// STATE HANDLERS
// ======================
function handleLobbyCreated(message) {
    state.lobbyCode = message.code;
    state.userRole = 'ref';
    
    // Update UI
    elements.lobbyCodeDisplay.textContent = state.lobbyCode;
    
    // Set participants
    state.participants.ref.name = "Referee";
    state.participants.ref.status = "connected";
    updateParticipantsList();
    
    // Switch to lobby view
    elements.mainPage.style.display = 'none';
    elements.lobbyView.style.display = 'block';
    
    showNotification("Lobby created! Share the code with players.");
    saveLocalState();
}

function handleLobbyJoined(message) {
    state.lobbyCode = message.lobbyCode;
    state.userRole = message.role;
    
    // Update UI
    elements.lobbyCodeDisplay.textContent = state.lobbyCode;
    
    // Set participants
    if (message.participants) {
        state.participants = message.participants;
    } else {
        // For local testing
        state.participants.p1.name = "Player 1";
        state.participants.p2.name = "Player 2";
        state.participants.ref.name = "Referee";
        
        state.participants.p1.status = "connected";
        state.participants.p2.status = "connected";
        state.participants.ref.status = "connected";
    }
    
    // Update current user name
    if (state.userRole === 'p1') {
        state.participants.p1.name = "Player 1";
    } else if (state.userRole === 'p2') {
        state.participants.p2.name = "Player 2";
    } else if (state.userRole === 'ref') {
        state.participants.ref.name = "Referee";
    }
    
    // Load existing state if in local mode
    if (state.serverType === 'local') {
        loadLocalState();
    }
    
    updateParticipantsList();
    
    // Switch to lobby view
    elements.lobbyView.style.display = 'block';
    elements.mainPage.style.display = 'none';
    
    showNotification(`Joined lobby as ${message.role === 'ref' ? 'Referee' : 'Player ' + message.role.slice(1)}`);
    saveLocalState();
}

function handleStateUpdate(message) {
    state.roster = message.roster;
    state.draft = message.draft;
    state.participants = message.participants;
    
    // Update UI based on new state
    renderIDList(elements.p1Roster, 'p1');
    renderIDList(elements.p2Roster, 'p2');
    updateRosterCounter('p1');
    updateRosterCounter('p2');
    updateDraftUI();
    updateParticipantsList();
    updateDraftInstructions();
    
    // Update draft started class
    if (state.draft.phase !== "roster") {
        document.body.classList.add('draft-started');
        elements.p1SearchBar.style.display = 'block';
        elements.p2SearchBar.style.display = 'block';
    } else {
        document.body.classList.remove('draft-started');
        elements.p1SearchBar.style.display = 'none';
        elements.p2SearchBar.style.display = 'none';
    }
    
    // Update ready states
    updateReadyUI('p1', state.participants.p1.ready);
    updateReadyUI('p2', state.participants.p2.ready);
    checkDraftReadiness();
    
    saveLocalState();
}

function handleParticipantUpdate(message) {
    state.participants = message.participants;
    updateParticipantsList();
    saveLocalState();
}

function handleRosterUpdate(message) {
    state.roster[message.player] = message.roster;
    
    // Update UI
    if (message.player === 'p1') {
        renderIDList(elements.p1Roster, 'p1');
        updateRosterCounter('p1');
    } else {
        renderIDList(elements.p2Roster, 'p2');
        updateRosterCounter('p2');
    }
    saveLocalState();
}

function handleReadyUpdate(message) {
    state.participants[message.player].ready = message.ready;
    updateReadyUI(message.player, message.ready);
    updateParticipantsList();
    checkDraftReadiness();
    saveLocalState();
}

function handleDraftAction(message) {
    state.draft = message.draft;
    updateDraftUI();
    updateDraftInstructions();
    
    if (state.draft.phase !== "roster") {
        document.body.classList.add('draft-started');
        elements.p1SearchBar.style.display = 'block';
        elements.p2SearchBar.style.display = 'block';
    } else {
        document.body.classList.remove('draft-started');
        elements.p1SearchBar.style.display = 'none';
        elements.p2SearchBar.style.display = 'none';
    }
}

// ======================
// EVENT HANDLERS
// ======================
function setupEventListeners() {
    // Server selection
    elements.serverOptions.forEach(option => {
        option.addEventListener('click', () => {
            elements.serverOptions.forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
            state.serverType = option.dataset.server;
            showNotification(`Switched to ${state.serverType === 'remote' ? 'Online Multiplayer' : 'Local Testing'} mode`);
            connectWebSocket();
        });
    });
    
    // Create new lobby
    elements.createLobbyBtn.addEventListener('click', () => {
        sendMessage({
            type: 'createLobby',
            userId: state.userId
        });
    });
    
    // Show join lobby form
    elements.joinLobbyBtn.addEventListener('click', () => {
        elements.lobbyAccessForm.style.display = 'block';
        elements.joinLobbyBtn.style.display = 'none';
    });
    
    // Role selection
    elements.roleOptions.forEach(option => {
        option.addEventListener('click', () => {
            // Remove selected class from all options
            elements.roleOptions.forEach(opt => opt.classList.remove('selected'));
            
            // Add selected class to clicked option
            option.classList.add('selected');
            
            // Store selected role
            state.userRole = option.dataset.role;
        });
    });
    
    // Enter lobby
    elements.enterLobbyBtn.addEventListener('click', () => {
        const lobbyCode = elements.lobbyCodeInput.value.trim().toUpperCase();
        
        if (lobbyCode.length !== 6) {
            alert('Please enter a valid 6-character lobby code');
            return;
        }
        
        if (!state.userRole) {
            alert('Please select your role');
            return;
        }
        
        sendMessage({
            type: 'joinLobby',
            lobbyCode: lobbyCode,
            userId: state.userId,
            role: state.userRole
        });
    });
    
    // Back to main menu
    elements.backToMainBtn.addEventListener('click', () => {
        // Reset state
        state.lobbyCode = "";
        state.userRole = "";
        state.participants = {
            p1: { name: "Player 1", status: "disconnected", ready: false },
            p2: { name: "Player 2", status: "disconnected", ready: false },
            ref: { name: "Referee", status: "disconnected" }
        };
        
        // Reset UI
        elements.lobbyAccessForm.style.display = 'none';
        elements.joinLobbyBtn.style.display = 'block';
        elements.lobbyCodeInput.value = "";
        elements.roleOptions.forEach(opt => opt.classList.remove('selected'));
        
        // Switch to main view
        elements.lobbyView.style.display = 'none';
        elements.mainPage.style.display = 'block';
        
        // Notify server we're leaving
        sendMessage({
            type: 'leaveLobby',
            lobbyCode: state.lobbyCode,
            userId: state.userId
        });
        
        if (state.serverType === 'local') {
            localStorage.removeItem(`limbus-draft-${state.lobbyCode}`);
        }
    });
    
    // Filter change listeners
    elements.sinnerFilter.addEventListener('change', (e) => {
        state.filters.sinner = e.target.value;
        renderIDList(elements.p1Roster, 'p1');
        renderIDList(elements.p2Roster, 'p2');
    });
    
    elements.sinAffinityFilter.addEventListener('change', (e) => {
        state.filters.sinAffinity = e.target.value;
        renderIDList(elements.p1Roster, 'p1');
        renderIDList(elements.p2Roster, 'p2');
    });
    
    elements.keywordFilter.addEventListener('change', (e) => {
        state.filters.keyword = e.target.value;
        renderIDList(elements.p1Roster, 'p1');
        renderIDList(elements.p2Roster, 'p2');
    });
    
    elements.resetFilters.addEventListener('click', () => {
        state.filters = { sinner: "", sinAffinity: "", keyword: "" };
        elements.sinnerFilter.value = "";
        elements.sinAffinityFilter.value = "";
        elements.keywordFilter.value = "";
        renderIDList(elements.p1Roster, 'p1');
        renderIDList(elements.p2Roster, 'p2');
    });
    
    // Search listeners
    elements.p1SearchInput.addEventListener('input', (e) => {
        state.search.p1 = e.target.value;
        renderIDList(elements.p1Roster, 'p1');
    });
    
    elements.p2SearchInput.addEventListener('input', (e) => {
        state.search.p2 = e.target.value;
        renderIDList(elements.p2Roster, 'p2');
    });
    
    // Set up roster buttons
    elements.p1Random.addEventListener('click', () => randomizeRoster('p1'));
    elements.p2Random.addEventListener('click', () => randomizeRoster('p2'));
    elements.p1Clear.addEventListener('click', () => clearRoster('p1'));
    elements.p2Clear.addEventListener('click', () => clearRoster('p2'));
    
    // Ready buttons
    elements.p1Ready.addEventListener('click', () => toggleReady('p1'));
    elements.p2Ready.addEventListener('click', () => toggleReady('p2'));
    
    function toggleReady(player) {
        if (state.userRole === player || state.userRole === 'ref') {
            // Toggle ready status
            const newReadyState = !state.participants[player].ready;
            state.participants[player].ready = newReadyState;
            
            // Update UI immediately
            updateReadyUI(player, newReadyState);
            updateParticipantsList();
            
            // Send update to server
            sendMessage({
                type: 'updateReady',
                lobbyCode: state.lobbyCode,
                userId: state.userId,
                player: player,
                ready: newReadyState
            });
            
            // Check if both are ready
            checkDraftReadiness();
            saveLocalState();
        }
    }
    
    // Draft control buttons
    elements.startDraft.addEventListener('click', () => startDraft());
    elements.nextPhase.addEventListener('click', () => nextPhase());
    elements.completeDraft.addEventListener('click', () => completeDraft());
    
    // Storage event listener for multi-tab sync
    window.addEventListener('storage', (event) => {
        if (!event.key || !event.key.startsWith('limbus-draft-')) return;
        if (!state.lobbyCode) return;
        
        if (event.key === `limbus-draft-${state.lobbyCode}`) {
            const newState = JSON.parse(event.newValue);
            console.log("Storage event received:", newState);
            
            if (newState && newState.version > state.version) {
                // Update state
                state.participants = newState.participants;
                state.roster = newState.roster;
                state.draft = newState.draft;
                state.version = newState.version;
                
                // Update UI
                updateParticipantsList();
                renderIDList(elements.p1Roster, 'p1');
                renderIDList(elements.p2Roster, 'p2');
                updateRosterCounter('p1');
                updateRosterCounter('p2');
                updateDraftUI();
                updateDraftInstructions();
                
                // Update draft started class
                if (state.draft.phase !== "roster") {
                    document.body.classList.add('draft-started');
                    elements.p1SearchBar.style.display = 'block';
                    elements.p2SearchBar.style.display = 'block';
                } else {
                    document.body.classList.remove('draft-started');
                    elements.p1SearchBar.style.display = 'none';
                    elements.p2SearchBar.style.display = 'none';
                }
                
                // Update ready buttons and status
                updateReadyUI('p1', state.participants.p1.ready);
                updateReadyUI('p2', state.participants.p2.ready);
                checkDraftReadiness();
            }
        }
    });
}

// ======================
// INITIALIZATION
// ======================
function init() {
    // Connect to WebSocket server
    connectWebSocket();
    
    // Set up event listeners
    setupEventListeners();
    
    // CSV data
    const csvData = `Name,Keywords,SinAffinities,Rarity,ImageURL
    "LCB Sinner Yi Sang","Sinking","Gloom,Envy,Sloth","0","https://www.prydwen.gg/_next/static/media/bg.9f0c4f7c.svg"
    "Seven Association South Section 6 Yi Sang","Rupture","Gloom,Gluttony,Sloth","00","https://www.prydwen.gg/static/0f240e53c195ebc09b8c3a7960542872/60b4d/25_sm.webp"
    "Molar Office Fixer Yi Sang","Discard,Tremor","Lust,Sloth,Wrath","00","https://www.prydwen.gg/static/4a85ec81405aa0aaf6908e6df8f40369/60b4d/72_sm.webp"
    "The Pequod First Mate Yi Sang","Bleed,Poise","Pride,Envy,Gluttony","00","https://www.prydwen.gg/static/a28a9a393e123429752f01aa2f7afc9e/60b4d/82_sm.webp"
    "Dieci Association South Section 4 Yi Sang","Aggro,Discard,Sinking","Gluttony,Lust,Sloth","00","https://www.prydwen.gg/static/85d853cc0187a992c9a821efd05f67c1/60b4d/88_sm.webp"
    "LCE E.G.O::Lantern Yi Sang","Aggro,Rupture","Sloth,Envy,Gluttony","00","https://www.prydwen.gg/static/5bea3a90b886b79c24d7a614119f463c/60b4d/130_sm.webp"
    "Blade Lineage Salsu Yi Sang","Poise","Pride,Envy,Sloth","000","https://www.prydwen.gg/static/ef86e778d37f850927e6c0f0bb89c477/60b4d/9_sm.webp"
    "Effloresced E.G.O::Spicebush Yi Sang","Sinking,Tremor","Gluttony,Sloth,Pride","000","https://www.prydwen.gg/static/60ed1931b4b7023f8ccbc74d21ccb9a6/60b4d/60_sm.webp"
    "W Corp. L3 Cleanup Agent Yi Sang","Charge,Rupture","Sloth,Gloom,Envy","000","https://www.prydwen.gg/static/b5af33ebae0a5d65731d21dd55222973/60b4d/77_sm.webp"
    "The Ring Pointillist Student Yi Sang","Bleed,Random","Gloom,Lust,Sloth","000","https://www.prydwen.gg/static/ee31c604f67572567f55b640e60647a6/60b4d/104_sm.webp"
    "Lobotomy E.G.O::Solemn Lament Yi Sang","Ammo,Sinking","Pride,Gloom,Sloth","000","https://www.prydwen.gg/static/f4a65d5b9f78fc39241d33ff233be908/60b4d/116_sm.webp"
    "Liu Association South Section 3 Yi Sang","Burn","Sloth,Wrath,Envy","000","https://www.prydwen.gg/static/5b8e265651380462a41d942a791a455d/60b4d/134_sm.webp"
    "LCB Sinner Faust","","Pride,Sloth,Gluttony","0","https://www.prydwen.gg/static/8a5e04ce3cf669ac6c20013fa984b65e/60b4d/27_sm.webp"
    "W Corp. L2 Cleanup Agent Faust","Charge","Envy,Gloom,Wrath","00","https://www.prydwen.gg/static/1106fa201a3c262606a170105ff70c98/60b4d/23_sm.webp"
    "Lobotomy Corp. Remnant Faust","Poise,Rupture","Sloth,Gloom,Envy","000","https://www.prydwen.gg/static/e1f0c9ce2f7d44dbd5bb8572396cde76/60b4d/22_sm.webp"
    "Zwei Association South Section 4 Faust","Aggro","Envy,Gloom,Lust","00","https://www.prydwen.gg/static/da43c69ea339de55dd8f8e787ea1e181/60b4d/66_sm.webp"
    "Wuthering Heights Butler Faust","Sinking","Gloom,Lust,Wrath","00","https://www.prydwen.gg/static/9e2a9b024c479198205e8a0a6e881b2d/60b4d/100_sm.webp"
    "The One Who Grips Faust","Bleed","Envy,Lust,Pride","000","https://www.prydwen.gg/static/a761d52d34cdbf88863cb4afff97e923/60b4d/42_sm.webp"
    "Seven Association South Section 4 Faust","Rupture","Envy,Gloom,Gluttony","000","https://www.prydwen.gg/static/25b151227f7fc5cd2ba257392f51ae80/60b4d/70_sm.webp"
    "Lobotomy E.G.O::Regret Faust","Tremor","Sloth,Pride,Wrath","000","https://www.prydwen.gg/static/6e2ae7b7153e8426020d8dadea2dccbf/60b4d/75_sm.webp"
    "Blade Lineage Salsu Faust","Bleed,Poise","Sloth,Pride,Gloom","000","https://www.prydwen.gg/static/b9d6475cc8809aa19cae0a38f79c15c4/60b4d/91_sm.webp"
    "MultiCrack Office Rep Faust","Charge","Lust,Envy,Gluttony","000","https://www.prydwen.gg/static/fb6b8b53dc532f78448644fda207755f/60b4d/112_sm.webp"
    "LCE E.G.O::Ardor Blossom Star Faust","Burn","Sloth,Pride,Wrath","000","https://www.prydwen.gg/static/172ba65f85b80394c0e1e6f60ea90017/60b4d/131_sm.webp"
    "Heishou Pack - Mao Branch Adept Faust","Rupture","Sloth,Pride,Gluttony","000","https://www.prydwen.gg/static/b2c64b8e9c19fcfe0d932562a6a220a0/60b4d/143_sm.webp"
    "LCB Sinner Don Quixote","Bleed","Lust,Envy,Gluttony","0","https://www.prydwen.gg/static/c832f4288e8210b40a79b55b2db2afba/60b4d/28_sm.webp"
    "Shi Association South Section 5 Director Don Quixote","Poise","Wrath,Envy,Lust","00","https://www.prydwen.gg/static/6c4bce5e89e11bc77a9d34ba20edbfdb/60b4d/21_sm.webp"
    "N Corp. Mittelhammer Don Quixote","Bleed,Tremor","Lust,Gluttony,Wrath","00","https://www.prydwen.gg/static/bbc0d493c45278952f8b5155bd4613d1/60b4d/48_sm.webp"
    "Lobotomy E.G.O::Lantern Don Quixote","Aggro,Rupture","Gluttony,Lust,Gloom","00","https://www.prydwen.gg/static/ee1c2d57ee38440cb0b6393278778c9b/60b4d/87_sm.webp"
    "Blade Lineage Salsu Don Quixote","Poise","Pride,Envy,Sloth","00","https://www.prydwen.gg/static/ca5eb1e4995c25e98ae0d5c11c95f740/60b4d/92_sm.webp"
    "W Corp. L3 Cleanup Agent Don Quixote","Charge,Rupture","Sloth,Gloom,Envy","000","https://www.prydwen.gg/static/be6a337e49377508a97c6c5b80d874ad/60b4d/8_sm.webp"
    "Cinq Association South Section 5 Director Don Quixote","","Lust,Gloom,Pride","000","https://www.prydwen.gg/static/8d7898c49e79bc948aaf9ef7dd1b5c4f/60b4d/63_sm.webp"
    "The Middle Little Sister Don Quixote","Bleed","Wrath,Envy,Pride","000","https://www.prydwen.gg/static/46456e768a8f693ed5f67cdf6d1443bb/60b4d/80_sm.webp"
    "T Corp. Class 3 Collection Staff Don Quixote","Aggro,Tremor","Gluttony,Pride,Sloth","000","https://www.prydwen.gg/static/7cb96fff62845de7da9b7ac66a5ad5de/60b4d/108_sm.webp"
    "The Manager of La Manchaland Don Quixote","Bleed","Sloth,Wrath,Lust","000","https://www.prydwen.gg/static/d1b673789c1471c1f3c98e5d440ecfbf/60b4d/127_sm.webp"
    "Cinq Association East Section 3 Don Quixote","Burn,Poise","Gluttony,Wrath,Pride","000","https://www.prydwen.gg/static/d722c0b8009e7d142f078acf1a5de8e7/60b4d/135_sm.webp"
    "LCB Sinner Ryōshū","Poise","Gluttony,Lust,Pride","0","https://www.prydwen.gg/static/03006ea467c31f6c042150828ea31e2e/60b4d/29_sm.webp"
    "Seven Association South Section 6 Ryōshū","Rupture","Sloth,Pride,Gluttony","00","https://www.prydwen.gg/static/79a4e028c096100458824ab948e101ed/60b4d/20_sm.webp"
    "LCCB Assistant Manager Ryōshū","Ammo,Poise,Rupture,Tremor","Lust,Gluttony,Pride","00","https://www.prydwen.gg/static/93b3931f3f1bdfa563d8e793b56bfcb9/60b4d/78_sm.webp"
    "Liu Association South Section 4 Ryōshū","Burn","Gluttony,Wrath,Lust","00","https://www.prydwen.gg/static/d7b28bdf0e10c5a4228f6034ac56075b/60b4d/59_sm.webp"
    "District 20 Yurodivy Ryōshū","Tremor","Lust,Sloth,Gluttony","00","https://www.prydwen.gg/static/1fc5700bcab91a522c185c9e252aa05c/60b4d/107_sm.webp"
    "Kurokumo Clan Wakashu Ryōshū","Bleed","Gluttony,Pride,Lust","000","https://www.prydwen.gg/static/977c349df7ac1431481467dac6d08faa/60b4d/7_sm.webp"
    "R.B. Chef de Cuisine Ryōshū","Bleed","Wrath,Envy,Lust","000","https://www.prydwen.gg/static/88c2eda90292c55f65397b233b97823c/60b4d/56_sm.webp"
    "W Corp. L3 Cleanup Agent Ryōshū","Charge","Lust,Pride,Envy","000","https://www.prydwen.gg/static/e5616044b587e751a8bcf4b483a86057/60b4d/68_sm.webp"
    "Edgar Family Chief Butler Ryōshū","Poise","Lust,Pride,Wrath","000","https://www.prydwen.gg/static/a1475463d364fcac8c455700e86fe085/60b4d/101_sm.webp"
    "Lobotomy E.G.O::Red Eyes & Penitence Ryōshū","Bleed","Envy,Gloom,Lust","000","https://www.prydwen.gg/static/acae3d253cbb63c402a6014750677cf7/60b4d/115_sm.webp"
    "Heishou Pack - Mao Branch Ryōshū","Rupture","Lust,Gluttony,Pride","00","https://www.prydwen.gg/static/6c1db068cdd26774516c3bb23ddcda89/60b4d/137_sm.webp"
    "LCB Sinner Meursault","Tremor","Sloth,Pride,Gloom","0","https://www.prydwen.gg/static/7db6c89c678c8b506d3694953b05bab1/60b4d/31_sm.webp"
    "Liu Association South Section 6 Meursault","Burn","Lust,Sloth,Wrath","00","https://www.prydwen.gg/static/27cfd501a22bcc30295cfd312451cb69/60b4d/19_sm.webp"
    "Rosespanner Workshop Fixer Meursault","Charge,Tremor","Gloom,Pride,Sloth","00","https://www.prydwen.gg/static/04b8f5d5b4b6d137fff603bd21d307dc/60b4d/49_sm.webp"
    "The Middle Little Brother Meursault","Bleed","Sloth,Envy,Wrath","00","https://www.prydwen.gg/static/cd1a9e812e7e5e97672f75ff9975e5de/60b4d/81_sm.webp"
    "Dead Rabbits Boss Meursault","Rupture","Lust,Wrath,Gluttony","00","https://www.prydwen.gg/static/1d5260bbc81ea56cd2756b48ae955dc1/60b4d/97_sm.webp"
    "W Corp. L2 Cleanup Agent Meursault","Charge,Rupture","Envy,Gluttony,Pride","000","https://www.prydwen.gg/static/9a9174857333d70f7170d922a5771384/60b4d/6_sm.webp"
    "N Corp. Großhammer Meursault","Aggro,Bleed","Sloth,Wrath,Pride","000","https://www.prydwen.gg/static/1353732db379f5f1b1f27340b0b60aeb/60b4d/40_sm.webp"
    "R Corp. 4th Pack Rhino Meursault","Bleed,Charge","Envy,Gloom,Lust","000","https://www.prydwen.gg/static/b660e733174071bd93af8f52150e180c/60b4d/62_sm.webp"
    "Blade Lineage Mentor Meursault","Poise","Pride,Pride,Wrath","000","https://www.prydwen.gg/static/0f00d1deb384f230a20bdb7b05d3490e/60b4d/93_sm.webp"
    "Dieci Association South Section 4 Director Meursault","Discard,Sinking","Gluttony,Sloth,Gloom","000","https://www.prydwen.gg/static/52bb208f7a675dd77cbc0aef73c5cb59/60b4d/110_sm.webp"
    "Cinq Association West Section 3 Meursault","Poise,Rupture","Pride,Gluttony,Gloom","000","https://www.prydwen.gg/static/48f7bd8f633ececc2cb1eb0f3dd38c68/60b4d/120_sm.webp"
    "The Thumb East Capo IIII Meursault","Ammo,Burn,Tremor","Sloth,Lust,Wrath","000","https://www.prydwen.gg/static/aab0c75b94d71c009ac67f0a92e4a4c5/60b4d/146_sm.webp"
    "LCB Sinner Hong Lu","Rupture,Sinking","Pride,Sloth,Lust","0","https://www.prydwen.gg/static/6f1d76103e3d8d53067dba4da6df22e5/60b4d/30_sm.webp"
    "Kurokumo Clan Wakashu Hong Lu","Bleed","Lust,Pride,Sloth","00","https://www.prydwen.gg/static/245d7c95b4d891707ad80731b742d8e5/60b4d/18_sm.webp"
    "Liu Association South Section 5 Hong Lu","Burn","Gloom,Lust,Wrath","00","https://www.prydwen.gg/static/142f5d88f3ece784d25a97288d6b3702/60b4d/43_sm.webp"
    "W Corp. L2 Cleanup Agent Hong Lu","Charge,Rupture","Pride,Wrath,Gluttony","00","https://www.prydwen.gg/static/8b7d42525ab3879f9f0badf304c58300/60b4d/67_sm.webp"
    "Hook Office Fixer Hong Lu","Bleed","Wrath,Lust,Pride","00","https://www.prydwen.gg/static/e1182961f8f5e6f1c2dc9b193bd02136/60b4d/76_sm.webp"
    "Fanghunt Office Fixer Hong Lu","Rupture","Gluttony,Pride,Wrath","00","https://www.prydwen.gg/static/a759a590043fd3f765aeacac294e239a/60b4d/122_sm.webp"
    "Tingtang Gang Gangleader Hong Lu","Bleed","Envy,Lust,Gluttony","000","https://www.prydwen.gg/static/7a0a1168b6ada9b410fbac93341270d7/60b4d/5_sm.webp"
    "K Corp. Class 3 Excision Staff Hong Lu","Aggro,Rupture","Pride,Gluttony,Sloth","000","https://www.prydwen.gg/static/3751337d133e36e84ff8b8d50a9d532e/60b4d/55_sm.webp"
    "Dieci Association South Section 4 Hong Lu","Discard,Sinking","Wrath,Gloom,Sloth","000","https://www.prydwen.gg/static/2b3049990e515c7fafa30fa9fbeffca1/60b4d/89_sm.webp"
    "District 20 Yurodivy Hong Lu","Tremor","Gloom,Sloth,Gluttony","000","https://www.prydwen.gg/static/5f4c8872f684b7485d25a11d08d34059/60b4d/106_sm.webp"
    "Full-Stop Office Rep Hong Lu","Ammo,Poise","Sloth,Gloom,Pride","000","https://www.prydwen.gg/static/2e93f7b6c2c68eb6cbcb6d3faf9663cf/60b4d/129_sm.webp"
    "R Corp. 4th Pack Reindeer Hong Lu","Charge,Sinking","Gluttony,Envy,Wrath","000","https://www.prydwen.gg/static/7ebf48b408cf52f5ffba79c33dbfadc9/60b4d/140_sm.webp"
    "LCB Sinner Heathcliff","Tremor","Envy,Wrath,Lust","0","https://www.prydwen.gg/static/acb2e419fce4f4e89d3df839ec9b5825/60b4d/36_sm.webp"
    "Shi Association South Section 5 Heathcliff","Poise","Lust,Wrath,Envy","00","https://www.prydwen.gg/static/59ee787c1899e1161bc6d2912bd19581/60b4d/17_sm.webp"
    "N Corp. Kleinhammer Heathcliff","Bleed","Envy,Gloom,Lust","00","https://www.prydwen.gg/static/56d04adab36f97e2680c52abe908b2a9/60b4d/41_sm.webp"
    "Seven Association South Section 4 Heathcliff","Rupture","Wrath,Envy,Gluttony","00","https://www.prydwen.gg/static/d19491cacf40a7df83a39acee155b6a5/60b4d/71_sm.webp"
    "MultiCrack Office Fixer Heathcliff","Charge","Wrath,Envy,Gloom","00","https://www.prydwen.gg/static/c4d9f0fdf0f27b1a39d3a6e133503db2/60b4d/113_sm.webp"
    "R Corp. 4th Pack Rabbit Heathcliff","Ammo,Bleed,Rupture","Wrath,Gluttony,Envy","000","https://www.prydwen.gg/static/62ee18bd06381322f84764c824c90a53/60b4d/4_sm.webp"
    "Lobotomy E.G.O::Sunshower Heathcliff","Rupture,Sinking,Tremor","Envy,Gloom,Sloth","000","https://www.prydwen.gg/static/030b1ce2512735460744a8a0b225eb1e/60b4d/51_sm.webp"
    "The Pequod Harpooneer Heathcliff","Aggro,Bleed,Poise","Pride,Envy,Envy","000","https://www.prydwen.gg/static/8e4eb796e8c34153fef641d90b655c4d/60b4d/83_sm.webp"
    "Öufi Association South Section 3 Heathcliff","Tremor","Envy,Gloom,Pride","000","https://www.prydwen.gg/static/0d02dd2042d811df533a3ce20f8002c4/60b4d/96_sm.webp"
    "Wild Hunt Heathcliff","Sinking","Wrath,Envy,Gloom","000","https://www.prydwen.gg/static/9b1426dc78e69dce69e857beb5b01c09/60b4d/114_sm.webp"
    "Full-Stop Office Fixer Heathcliff","Ammo,Poise","Gloom,Envy,Pride","000","https://www.prydwen.gg/static/1f97f6ff3294d4791cf2aac19ccc68ee/60b4d/128_sm.webp"
    "Kurokumo Clan Wakashu Heathcliff","Bleed","Wrath,Pride,Lust","000","https://www.prydwen.gg/static/9df47c6be41a4c157506dfe0d1068856/60b4d/132_sm.webp"
    "LCB Sinner Ishmael","Tremor","Wrath,Gluttony,Gloom","0","https://www.prydwen.gg/static/53513ccc3e2d99fbc7e13ad7d0503695/60b4d/32_sm.webp"
    "Shi Association South Section 5 Ishmael","Poise","Envy,Lust,Wrath","00","https://www.prydwen.gg/static/f47d3d0160f1d59aefa932ec60295ed5/60b4d/38_sm.webp"
    "LCCB Assistant Manager Ishmael","Aggro,Rupture,Tremor","Gluttony,Gloom,Pride","00","https://www.prydwen.gg/static/e46dfa2acf6584ad550071a741aed40b/60b4d/16_sm.webp"
    "Lobotomy E.G.O::Sloshing Ishmael","Aggro,Rupture,Tremor","Gloom,Wrath,Gluttony","00","https://www.prydwen.gg/static/bd63bd658c6634cd950717b456bbfd62/60b4d/53_sm.webp"
    "Edgar Family Butler Ishmael","Poise,Sinking","Sloth,Gluttony,Gloom","00","https://www.prydwen.gg/static/2f10b599ddea2ee2c94d8eda7126da39/60b4d/102_sm.webp"
    "R Corp. 4th Pack Reindeer Ishmael","Charge,Sinking","Gloom,Envy,Wrath","000","https://www.prydwen.gg/static/0a071e4a7c5af14d7acccd9116efd804/60b4d/3_sm.webp"
    "Liu Association South Section 4 Ishmael","Burn","Lust,Wrath,Envy","000","https://www.prydwen.gg/static/58732273f94e6032c5fec247ae6b67d7/60b4d/58_sm.webp"
    "Molar Boatworks Fixer Ishmael","Sinking,Tremor","Pride,Sloth,Gloom","000","https://www.prydwen.gg/static/69710519b4912fcc9a14e94b1136b6f5/60b4d/64_sm.webp"
    "The Pequod Captain Ishmael","Aggro,Bleed,Burn","Envy,Pride,Wrath","000","https://www.prydwen.gg/static/6e8b41e245395bcd6cc0547d1d7acd4b/60b4d/90_sm.webp"
    "Zwei Association West Section 3 Ishmael","Aggro,Tremor","Pride,Envy,Gluttony","000","https://www.prydwen.gg/static/a53cff4436c4a0f5d417ed06cbdb7088/60b4d/118_sm.webp"
    "Kurokumo Clan Captain Ishmael","Bleed","Envy,Pride,Lust","000","https://www.prydwen.gg/static/c84824252f341306ad0fcf85157dc90a/60b4d/133_sm.webp"
    "Family Hierarch Candidate Ishmael","Poise,Rupture","Gloom,Gluttony,Envy","000","https://www.prydwen.gg/static/ad8919455ed70529a2eb3c26993bfc22/60b4d/144_sm.webp"
    "LCB Sinner Rodion","Bleed","Gluttony,Pride,Wrath","0","https://www.prydwen.gg/static/c0049ad4a490f047682177a306e04e43/60b4d/33_sm.webp"
    "LCCB Assistant Manager Rodion","","Pride,Gluttony,Envy","00","https://www.prydwen.gg/static/df07e622212a052922082c0bafcd5ee7/60b4d/15_sm.webp"
    "N Corp. Mittelhammer Rodion","Bleed","Pride,Lust,Wrath","00","https://www.prydwen.gg/static/ede72adc95688a4a91e38b378bf8246e/60b4d/39_sm.webp"
    "Zwei Association South Section 5 Rodion","Aggro,Poise","Wrath,Sloth,Gloom","00","https://www.prydwen.gg/static/52825cf2a2cfe7fff0d8ff29102976e1/60b4d/61_sm.webp"
    "T Corp. Class 2 Collection Staff Rodion","Tremor","Envy,Wrath,Sloth","00","https://www.prydwen.gg/static/0dd697f61cac40b1253dcefe9a33e19f/60b4d/109_sm.webp"
    "Kurokumo Clan Wakashu Rodion","Bleed,Poise","Gluttony,Lust,Pride","000","https://www.prydwen.gg/static/fd7e1e036eca3cf4c3df4da224a5deb8/60b4d/2_sm.webp"
    "Rosespanner Workshop Rep Rodion","Charge,Tremor","Pride,Gloom,Envy","000","https://www.prydwen.gg/static/de42912c7eb83c76cbd754704f64fe71/60b4d/50_sm.webp"
    "Dieci Association South Section 4 Rodion","Aggro,Discard,Sinking","Gloom,Envy,Sloth","000","https://www.prydwen.gg/static/644a063ef07163b6eaa55f3814eb875e/60b4d/74_sm.webp"
    "Liu Association South Section 4 Director Rodion","Burn","Pride,Wrath,Lust","000","https://www.prydwen.gg/static/aaf175ac9db4d93b03eae0463f59d9c3/60b4d/95_sm.webp"
    "Devyat' Association North Section 3 Rodion","Rupture","Lust,Wrath,Gluttony","000","https://www.prydwen.gg/static/bb3d4810b9c58d75e0284a8b3fc700c5/60b4d/117_sm.webp"
    "The Princess of La Manchaland Rodion","Bleed,Rupture","Pride,Envy,Lust","000","https://www.prydwen.gg/static/aa474590fdb17cb301462e677fd54b08/60b4d/124_sm.webp"
    "Heishou Pack - Si Branch Rodion","Poise,Rupture","Envy,Gluttony,Gloom","000","https://www.prydwen.gg/static/1dccf187a58256faf22d8bfbc4fcfc90/60b4d/142_sm.webp"
    "LCB Sinner Sinclair","Rupture","Pride,Wrath,Envy","0","https://www.prydwen.gg/static/34791758301b54cba3f567b86d8f85e1/60b4d/34_sm.webp"
    "Zwei Association South Section 6 Sinclair","Aggro,Tremor","Gloom,Wrath,Sloth","00","https://www.prydwen.gg/static/72a7d67c5245c3c95273d87d426bc990/60b4d/14_sm.webp"
    "Los Mariachis Jefe Sinclair","Poise,Sinking","Sloth,Envy,Gloom","00","https://www.prydwen.gg/static/53217aa98aed9e95351771248e86879f/60b4d/24_sm.webp"
    "Lobotomy E.G.O::Red Sheet Sinclair","Rupture","Gluttony,Pride,Lust","00","https://www.prydwen.gg/static/451b238456cada7fdd7190d07b230842/60b4d/56_sm.webp"
    "Molar Boatworks Fixer Sinclair","Tremor","Gloom,Envy,Gluttony","00","https://www.prydwen.gg/static/a09bc48a47f4abbce33583e5bb68c6d9/60b4d/65_sm.webp"
    "Zwei Association West Section 3 Sinclair","Aggro,Tremor","Lust,Gloom,Sloth","00","https://www.prydwen.gg/static/3faaa5089eaafe39a390420a787a78ee/507b0/119_sm.webp"
    "Blade Lineage Salsu Sinclair","Bleed,Poise","Gluttony,Wrath,Pride","000","https://www.prydwen.gg/static/2781029f2c5225e997309500acbde2a1/60b4d/10_sm.webp"
    "The One Who Shall Grip Sinclair","Bleed,Burn","Gloom,Lust,Wrath","000","https://www.prydwen.gg/static/88eebf49c3821eae574cdeab6cb34a2a/60b4d/47_sm.webp"
    "Cinq Association South Section 4 Director Sinclair","Poise","Gluttony,Pride,Lust","000","https://www.prydwen.gg/static/abffbe926889e9ae0eb6aca5d3d6f6d7/60b4d/84_sm.webp"
    "Dawn Office Fixer Sinclair","Bleed","Gloom,Envy,Wrath","000","https://www.prydwen.gg/static/c6265b4bd44090dda305056cfc19de4d/60b4d/103_sm.webp"
    "Devyat' Association North Section 3 Sinclair","Rupture","Lust,Gluttony,Wrath","000","https://www.prydwen.gg/static/442aca378ead71d06fd000b0ac0df7a4/60b4d/126_sm.webp"
    "The Middle Little Brother Sinclair","Aggro,Bleed","Lust,Gluttony,Wrath","000","https://www.prydwen.gg/static/369b697bbd47ec33aff4a567b5f2d50a/60b4d/139_sm.webp"
    "The Thumb East Soldato II Sinclair","Ammo,Burn,Tremor","Lust,Sloth,Wrath","000","https://www.prydwen.gg/static/b10536ffc33ceb8211e49f704ccbb7ac/60b4d/145_sm.webp"
    "LCB Sinner Outis","Rupture","Sloth,Pride,Gloom","0","https://www.prydwen.gg/static/3b2c0a096923d52920b79b61ba78a4ef/60b4d/35_sm.webp"
    "Blade Lineage Salsu Outis","Poise","Wrath,Lust,Pride","00","https://www.prydwen.gg/static/ae6bd12a9fa51eead419bf0d983c410a/60b4d/13_sm.webp"
    "G Corp. Head Manager Outis","Sinking","Sloth,Gluttony,Gloom","00","https://www.prydwen.gg/static/d7a0e85f3abfc49977fafacbad3a02d9/60b4d/12_sm.webp"
    "Cinq Association South Section 4 Outis","Aggro,Poise","Pride,Gloom,Lust","00","https://www.prydwen.gg/static/76b4c89b1261d280bbc2ce5228fda110/60b4d/85_sm.webp"
    "The Ring Pointillist Student Outis","Bleed,Random","Lust,Wrath,Gluttony","00","https://www.prydwen.gg/static/f2cdd071f5b6084bd1acdbd65ddd67f1/60b4d/105_sm.webp"
    "Seven Association South Section 6 Director Outis","Rupture","Gluttony,Sloth,Lust","000","https://www.prydwen.gg/static/87e49f2bcce0cf83161d8b2a36a0d727/60b4d/44_sm.webp"
    "Molar Office Fixer Outis","Discard,Tremor","Wrath,Lust,Sloth","000","https://www.prydwen.gg/static/c9bf2c186062ee87df3dd1d8efe1a7df/60b4d/73_sm.webp"
    "Lobotomy E.G.O::Magic Bullet Outis","Burn","Wrath,Pride,Pride","000","https://www.prydwen.gg/static/edbb9e84990c186753eb74e3aabf32e4/60b4d/86_sm.webp"
    "Wuthering Heights Chief Butler Outis","Sinking","Pride,Gloom,Lust","000","https://www.prydwen.gg/static/b5ca4151de4af67150d7e15f9ce5be57/60b4d/98_sm.webp"
    "W Corp. L3 Cleanup Captain Outis","Charge,Rupture","Pride,Envy,Gloom","000","https://www.prydwen.gg/static/1b0d732c7163be660950d563b85e1673/60b4d/111_sm.webp"
    "The Barber of La Manchaland Outis","Bleed","Gluttony,Lust,Wrath","000","https://www.prydwen.gg/static/8d6746b713c1cf951d9d03305123ead6/60b4d/121_sm.webp"
    "Heishou Pack - Mao Branch Outis","Rupture","Sloth,Gluttony,Gloom","000","https://www.prydwen.gg/static/f7fb470c40456530abfe70fbb029a967/60b4d/138_sm.webp"
    "LCB Sinner Gregor","Rupture","Gloom,Gluttony,Sloth","0","https://www.prydwen.gg/static/becc6845c70e6ecc5d042abc0441f304/60b4d/37_sm.webp"
    "Liu Association South Section 6 Gregor","Burn","Wrath,Lust,Sloth","00","https://www.prydwen.gg/static/81995183d0e6e55b2d74502e477898a8/60b4d/11_sm.webp"
    "R.B. Sous-chef Gregor","Bleed","Lust,Gluttony,Envy","00","https://www.prydwen.gg/static/9c852fb36ff6a2eea79e5d5615f89d5f/60b4d/45_sm.webp"
    "Rosespanner Workshop Fixer Gregor","Rupture,Tremor","Gluttony,Envy,Gloom","00","https://www.prydwen.gg/static/668359eab88bc900c77d5a7b9806164b/60b4d/52_sm.webp"
    "Kurokumo Clan Captain Gregor","Bleed","Sloth,Lust,Gloom","00","https://www.prydwen.gg/static/da12dde6d9c1a641bb301a363febbaef/60b4d/94_sm.webp"
    "G Corp. Manager Corporal Gregor","Rupture","Gluttony,Sloth,Lust","000","https://www.prydwen.gg/static/088a3561e67414ea5bebd5bd5b2ffc12/60b4d/1_sm.webp"
    "Zwei Association South Section 4 Gregor","Aggro","Sloth,Gluttony,Gloom","000","https://www.prydwen.gg/static/fc87af82e8f782981a57e7e15ce48af4/60b4d/65_sm.webp"
    "Twinhook Pirates First Mate Gregor","Ammo,Bleed,Poise","Sloth,Pride,Gloom","000","https://www.prydwen.gg/static/5092280038241b2280121750f727db36/60b4d/79_sm.webp"
    "Edgar Family Heir Gregor","Sinking","Envy,Pride,Lust","000","https://www.prydwen.gg/static/9300261e406e22f55996ab091f8d7d5e/60b4d/99_sm.webp"
    "The Priest of La Manchaland Gregor","Aggro,Bleed,Rupture","Gluttony,Pride,Lust","000","https://www.prydwen.gg/static/57c3fd8fc751adfc0017942defe69e78/60b4d/123_sm.webp"
    "Firefist Office Survivor Gregor","Burn","Lust,Wrath,Wrath","000","https://www.prydwen.gg/static/a737268518735d538f3b9e9a6a7db1be/60b4d/136_sm.webp"
    "Heishou Pack - Si Branch Gregor","Poise,Rupture","Pride,Gluttony,Envy","000","https://www.prydwen.gg/static/5843512b34961d6f7553d94006fd5df0/60b4d/141_sm.webp"`;
    
    // Parse CSV and set master ID list
    state.masterIDList = parseCSV(csvData);
    
    // Initial render
    renderIDList(elements.p1Roster, 'p1');
    renderIDList(elements.p2Roster, 'p2');
    updateRosterCounter('p1');
    updateRosterCounter('p2');
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', init);
