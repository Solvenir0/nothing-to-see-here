const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');
const { Firestore } = require('@google-cloud/firestore');

// Initialize Firestore
const firestore = new Firestore();

const app = express();
const server = http.createServer(app);

app.use(express.static(path.join(__dirname)));

// Health check endpoint for the hosting platform
app.get('/_ah/health', (req, res) => {
  res.status(200).send('OK');
});

const wss = new WebSocket.Server({ server });

// --- UTILITY FUNCTIONS ---
function generateLobbyCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function createNewLobbyState() {
    return {
        participants: {
            p1: { name: "Player 1", status: "disconnected", ready: false },
            p2: { name: "Player 2", status: "disconnected", ready: false },
            ref: { name: "Referee", status: "disconnected" }
        },
        roster: { p1: [], p2: [] },
        draft: {
            phase: "roster", step: 0, currentPlayer: "", action: "", actionCount: 0,
            available: { p1: [], p2: [] }, idBans: { p1: [], p2: [] }, picks: { p1: [], p2: [] }
        }
    };
}

// --- DRAFT LOGIC ---
function nextPhase(lobbyData) {
    const { draft } = lobbyData;
    // This logic remains the same as your original
    switch (draft.phase) {
        case "ban":
            if (draft.step < 7) {
                draft.step++;
                draft.currentPlayer = draft.currentPlayer === "p1" ? "p2" : "p1";
            } else {
                draft.phase = "pick"; draft.step = 0;
                const pickSeq1 = [{ p: 'p1', c: 1 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 1 }];
                const next = pickSeq1[draft.step];
                draft.currentPlayer = next.p; draft.action = "pick"; draft.actionCount = next.c;
            }
            break;
        case "pick":
            const pickSeq1 = [{ p: 'p1', c: 1 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 1 }];
            if (draft.step < pickSeq1.length - 1) {
                draft.step++;
                const next = pickSeq1[draft.step];
                draft.currentPlayer = next.p; draft.actionCount = next.c;
            } else {
                draft.phase = "midBan"; draft.step = 0; draft.currentPlayer = "p1";
                draft.action = "ban"; draft.actionCount = 1;
            }
            break;
        case "midBan":
            if (draft.step < 5) {
                draft.step++;
                draft.currentPlayer = draft.currentPlayer === "p1" ? "p2" : "p1";
            } else {
                draft.phase = "pick2"; draft.step = 0;
                const pickSeq2 = [{ p: 'p2', c: 1 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 1 }];
                const next = pickSeq2[draft.step];
                draft.currentPlayer = next.p; draft.action = "pick"; draft.actionCount = next.c;
            }
            break;
        case "pick2":
            const pickSeq2 = [{ p: 'p2', c: 1 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 1 }];
            if (draft.step < pickSeq2.length - 1) {
                draft.step++;
                const next = pickSeq2[draft.step];
                draft.currentPlayer = next.p; draft.actionCount = next.c;
            } else {
                draft.phase = "complete"; draft.currentPlayer = "";
            }
            break;
    }
    return lobbyData;
}

// --- COMMUNICATION ---
async function broadcastState(lobbyCode) {
    const lobbyRef = firestore.collection('lobbies').doc(lobbyCode);
    const lobbyDoc = await lobbyRef.get();
    if (!lobbyDoc.exists) return;

    const lobbyData = lobbyDoc.data();
    const message = JSON.stringify({ type: 'stateUpdate', state: lobbyData });

    wss.clients.forEach(client => {
        if (client.lobbyCode === lobbyCode && client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// --- MAIN WEBSOCKET LOGIC ---
wss.on('connection', (ws) => {
    console.log('Client connected');

    ws.on('message', async (message) => {
        let incomingData;
        try {
            incomingData = JSON.parse(message);
        } catch (e) {
            console.error('Invalid JSON received:', message);
            return;
        }

        const { lobbyCode, role, player, id, action, payload, name } = incomingData; // FIX 4: Destructure name
        const lobbyRef = lobbyCode ? firestore.collection('lobbies').doc(lobbyCode.toUpperCase()) : null;

        switch (incomingData.type) {
            case 'createLobby': {
                const newLobbyCode = generateLobbyCode();
                const newLobbyState = createNewLobbyState();
                
                ws.lobbyCode = newLobbyCode;
                ws.userRole = 'ref';
                
                // FIX 4: Set referee name if provided
                if (name) {
                    newLobbyState.participants.ref.name = name;
                }
                newLobbyState.participants.ref.status = "connected";

                await firestore.collection('lobbies').doc(newLobbyCode).set(newLobbyState);

                ws.send(JSON.stringify({ type: 'lobbyCreated', code: newLobbyCode, state: newLobbyState }));
                console.log(`Lobby created: ${newLobbyCode}`);
                break;
            }

            case 'joinLobby': {
                if (!lobbyRef) return;
                const doc = await lobbyRef.get();
                if (!doc.exists) return ws.send(JSON.stringify({ type: 'error', message: 'Lobby not found.' }));
                
                ws.lobbyCode = lobbyCode.toUpperCase();
                ws.userRole = role;
                
                // FIX 4: Update participant name if provided
                const updates = { [`participants.${role}.status`]: 'connected' };
                if (name) {
                    updates[`participants.${role}.name`] = name;
                }
                await lobbyRef.update(updates);
                
                const updatedDoc = await lobbyRef.get();
                ws.send(JSON.stringify({ type: 'lobbyJoined', lobbyCode: ws.lobbyCode, role, state: updatedDoc.data() }));
                broadcastState(ws.lobbyCode);
                break;
            }

            case 'rosterSelect': {
                if (!lobbyRef) return;
                const doc = await lobbyRef.get();
                if (!doc.exists) return;
                let lobbyData = doc.data();

                if (lobbyData.participants[player].ready) return;
                const roster = lobbyData.roster[player];
                const index = roster.indexOf(id);
                if (index === -1) {
                    if (roster.length < 42) roster.push(id);
                } else {
                    roster.splice(index, 1);
                }
                
                await lobbyRef.update({ [`roster.${player}`]: roster });
                broadcastState(lobbyCode.toUpperCase());
                break;
            }
            
            case 'rosterRandomize': {
                if (!lobbyRef) return;
                const doc = await lobbyRef.get();
                if (!doc.exists) return;
                let lobbyData = doc.data();

                if (lobbyData.participants[player].ready) return;
                const masterIDList = Array.from({length: 184}, (_, i) => i + 1);
                const shuffled = [...masterIDList].sort(() => 0.5 - Math.random());
                const newRoster = shuffled.slice(0, 42);
                
                await lobbyRef.update({ [`roster.${player}`]: newRoster });
                broadcastState(lobbyCode.toUpperCase());
                break;
            }

            case 'rosterClear': {
                if (!lobbyRef) return;
                const doc = await lobbyRef.get();
                if (!doc.exists) return;
                let lobbyData = doc.data();

                if (lobbyData.participants[player].ready) return;
                
                await lobbyRef.update({ [`roster.${player}`]: [] });
                broadcastState(lobbyCode.toUpperCase());
                break;
            }

            case 'updateReady': {
                if (!lobbyRef) return;
                const doc = await lobbyRef.get();
                if (!doc.exists) return;
                let lobbyData = doc.data();

                const currentReadyState = lobbyData.participants[player].ready;
                if (!currentReadyState && lobbyData.roster[player].length !== 42) return;
                
                await lobbyRef.update({ [`participants.${player}.ready`]: !currentReadyState });
                broadcastState(lobbyCode.toUpperCase());
                break;
            }

            case 'draftControl': {
                if (!lobbyRef || ws.userRole !== 'ref') return;
                const doc = await lobbyRef.get();
                if (!doc.exists) return;
                let lobbyData = doc.data();

                if (action === 'start') {
                    if (lobbyData.participants.p1.ready && lobbyData.participants.p2.ready) {
                        lobbyData.draft.phase = "ban";
                        lobbyData.draft.step = 0;
                        lobbyData.draft.currentPlayer = "p1";
                        lobbyData.draft.action = "ban";
                        lobbyData.draft.actionCount = 1;
                        lobbyData.draft.available.p1 = [...lobbyData.roster.p1];
                        lobbyData.draft.available.p2 = [...lobbyData.roster.p2];
                    }
                } else if (action === 'nextPhase' || action === 'complete') {
                    lobbyData = nextPhase(lobbyData);
                }
                
                await lobbyRef.update({ draft: lobbyData.draft });
                broadcastState(lobbyCode.toUpperCase());
                break;
            }

            case 'draftSelect': {
                if (!lobbyRef) return;
                const doc = await lobbyRef.get();
                if (!doc.exists) return;
                let lobbyData = doc.data();
                
                const { id: selectedId } = payload; // Use a different name to avoid conflict
                const actingPlayer = lobbyData.draft.currentPlayer;
                if (ws.userRole !== actingPlayer && ws.userRole !== 'ref') return;

                const currentAction = lobbyData.draft.action;
                if (currentAction === 'ban') {
                    lobbyData.draft.idBans[actingPlayer].push(selectedId);
                    let p1Index = lobbyData.draft.available.p1.indexOf(selectedId);
                    if(p1Index > -1) lobbyData.draft.available.p1.splice(p1Index, 1);
                    let p2Index = lobbyData.draft.available.p2.indexOf(selectedId);
                    if(p2Index > -1) lobbyData.draft.available.p2.splice(p2Index, 1);
                } else if (currentAction === 'pick') {
                    lobbyData.draft.picks[actingPlayer].push(selectedId);
                    let p1Index = lobbyData.draft.available.p1.indexOf(selectedId);
                    if (p1Index > -1) lobbyData.draft.available.p1.splice(p1Index, 1);
                    let p2Index = lobbyData.draft.available.p2.indexOf(selectedId);
                    if (p2Index > -1) lobbyData.draft.available.p2.splice(p2Index, 1);
                }
                
                lobbyData.draft.actionCount--;
                if (lobbyData.draft.actionCount <= 0) {
                    lobbyData = nextPhase(lobbyData);
                }
                
                await lobbyRef.update({ draft: lobbyData.draft });
                broadcastState(lobbyCode.toUpperCase());
                break;
            }
        }
    });

    ws.on('close', async () => {
        console.log('Client disconnected');
        const { lobbyCode, userRole } = ws;
        if (lobbyCode && userRole) {
            const lobbyRef = firestore.collection('lobbies').doc(lobbyCode);
            const doc = await lobbyRef.get();
            if (doc.exists) {
                await lobbyRef.update({
                    [`participants.${userRole}.status`]: 'disconnected',
                    [`participants.${userRole}.ready`]: false,
                });
                broadcastState(lobbyCode);
            }
        }
    });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});
