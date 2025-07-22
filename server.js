// =================================================================================
// FILE: server.js (for Vue SPA)
// DESCRIPTION: This server is configured to support a single-page application (SPA).
// It serves the main index.html for all front-end routes and handles WebSocket logic.
// =================================================================================
const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);

// Serve static files from the root directory (for style.css, data.js, etc.)
app.use(express.static(path.join(__dirname)));
// Serve images from the 'uploads' directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const wss = new WebSocket.Server({ server });

// In-memory storage for lobbies
const lobbies = {};

// ================================= //
//         DRAFT CONSTANTS           //
// ================================= //
const ROSTER_SIZE = 42;
const EGO_BAN_COUNT = 5;

// --- DRAFT LOGIC SEQUENCES ---
const DRAFT_LOGIC = {
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


// ================================= //
//         HELPER FUNCTIONS          //
// ================================= //

function generateUniqueLobbyCode() {
    let code;
    do {
        code = Math.random().toString(36).substring(2, 8).toUpperCase();
    } while (lobbies[code]);
    return code;
}

function createNewLobbyState(options = {}) {
    const { draftLogic = '1-2-2', timerEnabled = false, isPublic = false, name = 'Referee', matchType = 'section1' } = options;
    return {
        hostName: name,
        participants: {
            p1: { name: "Player 1", status: "disconnected", ready: false, rejoinToken: null },
            p2: { name: "Player 2", status: "disconnected", ready: false, rejoinToken: null },
            ref: { name: name, status: "disconnected", rejoinToken: null }
        },
        roster: { p1: [], p2: [] },
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
            draftLogic,
            matchType,
            isPublic,
            coinFlipWinner: null,
            playerOrder: ['p1', 'p2'],
        }
    };
}

function broadcastState(lobbyCode) {
    const lobbyData = lobbies[lobbyCode];
    if (!lobbyData) return;

    const message = JSON.stringify({ type: 'stateUpdate', state: lobbyData });

    wss.clients.forEach(client => {
        if (client.lobbyCode === lobbyCode && client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// ================================= //
//       WEBSOCKET CONNECTION        //
// ================================= //

wss.on('connection', (ws) => {
    console.log('Client connected');

    ws.on('message', (message) => {
        let incomingData;
        try {
            incomingData = JSON.parse(message);
        } catch (e) {
            console.error('Invalid JSON:', message);
            return;
        }

        const { type, options, lobbyCode: rawLobbyCode, name, role, rejoinToken, player, roster } = incomingData;
        const lobbyCode = rawLobbyCode ? rawLobbyCode.toUpperCase() : null;
        let lobbyData = lobbyCode ? lobbies[lobbyCode] : null;

        switch (type) {
            case 'createLobby': {
                const newLobbyCode = generateUniqueLobbyCode();
                const newLobbyState = createNewLobbyState(options);
                ws.lobbyCode = newLobbyCode;
                ws.userRole = 'ref';
                const newRejoinToken = crypto.randomUUID();

                newLobbyState.participants.ref.status = "connected";
                newLobbyState.participants.ref.rejoinToken = newRejoinToken;
                if (options.name) newLobbyState.participants.ref.name = options.name;
                
                lobbies[newLobbyCode] = newLobbyState;
                
                ws.send(JSON.stringify({ 
                    type: 'lobbyCreated', 
                    lobbyCode: newLobbyCode, 
                    role: 'ref', 
                    rejoinToken: newRejoinToken, 
                    state: newLobbyState 
                }));
                broadcastState(newLobbyCode);
                break;
            }

            case 'joinLobby': {
                if (!lobbyData) {
                    return ws.send(JSON.stringify({ type: 'error', message: 'Lobby not found.' }));
                }

                let assignedRole = null;
                if (lobbyData.participants.p1.status === 'disconnected') assignedRole = 'p1';
                else if (lobbyData.participants.p2.status === 'disconnected') assignedRole = 'p2';
                else if (lobbyData.participants.ref.status === 'disconnected') assignedRole = 'ref';

                if (!assignedRole) {
                    return ws.send(JSON.stringify({ type: 'error', message: 'Lobby is full.' }));
                }
                
                ws.lobbyCode = lobbyCode;
                ws.userRole = assignedRole;
                const newRejoinToken = crypto.randomUUID();

                lobbyData.participants[assignedRole].status = 'connected';
                lobbyData.participants[assignedRole].rejoinToken = newRejoinToken;
                if (name) lobbyData.participants[assignedRole].name = name;
                
                ws.send(JSON.stringify({ 
                    type: 'lobbyJoined', 
                    lobbyCode: ws.lobbyCode, 
                    role: assignedRole, 
                    rejoinToken: newRejoinToken,
                    state: lobbyData 
                }));
                broadcastState(ws.lobbyCode);
                break;
            }
            
            case 'rejoinLobby': {
                 if (!lobbyData || !role || !rejoinToken) return;
                
                const participant = lobbyData.participants[role];

                if (participant && participant.rejoinToken === rejoinToken) {
                    ws.lobbyCode = lobbyCode;
                    ws.userRole = role;
                    lobbyData.participants[role].status = 'connected';
                    
                    ws.send(JSON.stringify({
                        type: 'lobbyJoined',
                        lobbyCode: ws.lobbyCode,
                        role,
                        rejoinToken: rejoinToken,
                        state: lobbyData
                    }));
                    broadcastState(lobbyCode);
                } else {
                    ws.send(JSON.stringify({ type: 'error', message: 'Failed to rejoin. The session might be invalid.' }));
                }
                break;
            }

            case 'rosterSet': {
                if (!lobbyData || !player || !roster) return;
                if (lobbyData.participants[player].ready) return;
                if (Array.isArray(roster) && roster.length === ROSTER_SIZE) {
                    lobbyData.roster[player] = roster;
                    broadcastState(lobbyCode);
                }
                break;
            }
            
            case 'rosterRandomize': {
                if (!lobbyData || !player) return;
                if (lobbyData.participants[player].ready) return;
                // This requires the master ID list on the server, which we don't have.
                // This action should be handled client-side, and then send a 'rosterSet' message.
                // For now, we'll just notify the client that this should be client-side.
                ws.send(JSON.stringify({ type: 'notification', text: 'Randomization should be handled client-side.', isError: true }));
                break;
            }

            case 'rosterClear': {
                if (!lobbyData || !player) return;
                if (lobbyData.participants[player].ready) return;
                lobbyData.roster[player] = [];
                broadcastState(lobbyCode);
                break;
            }

            case 'updateReady': {
                if (!lobbyData || !player) return;
                const participant = lobbyData.participants[player];
                const currentRoster = lobbyData.roster[player];
                if (!participant.ready && currentRoster.length !== ROSTER_SIZE) {
                    return ws.send(JSON.stringify({ type: 'notification', text: `Player must have ${ROSTER_SIZE} IDs to be ready.`, isError: true }));
                }
                participant.ready = !participant.ready;
                broadcastState(lobbyCode);
                break;
            }

            case 'startCoinFlip': {
                if (!lobbyData || ws.userRole !== 'ref') return;
                const p1Ready = lobbyData.participants.p1.ready;
                const p2Ready = lobbyData.participants.p2.ready;
                if (!p1Ready || !p2Ready) {
                    return ws.send(JSON.stringify({ type: 'notification', text: 'Both players must be ready.', isError: true }));
                }
                lobbyData.draft.phase = 'coinFlip';
                lobbyData.draft.coinFlipWinner = Math.random() < 0.5 ? 'p1' : 'p2';
                broadcastState(lobbyCode);
                break;
            }
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        const { lobbyCode, userRole } = ws;
        if (lobbyCode && userRole && lobbies[lobbyCode]) {
            const lobbyData = lobbies[lobbyCode];
            lobbyData.participants[userRole].status = 'disconnected';
            broadcastState(lobbyCode);
        }
    });
});


// ================================= //
//         SPA ROUTE HANDLING        //
// ================================= //

app.get('*', (req, res) => {
    if (req.path.includes('.') || req.path.startsWith('/uploads')) {
        res.status(404).send('Not found');
        return;
    }
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ================================= //
//           SERVER START            //
// ================================= //
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`Server is listening on port ${PORT}`));
