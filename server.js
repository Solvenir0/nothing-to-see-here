const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');
const { Firestore } = require('@google-cloud/firestore');

// FIRESTORE: Initialize the database
const firestore = new Firestore();

const app = express();
const server = http.createServer(app);

app.use(express.static(path.join(__dirname)));

// Health check endpoint for Google App Engine
app.get('/_ah/health', (req, res) => {
  res.status(200).send('OK');
});

const wss = new WebSocket.Server({ server });

// --- UTILITY & STATE FUNCTIONS ---
function generateLobbyCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code; // Uniqueness will be checked before writing to DB
}

function createNewLobbyState() {
    return {
        // We no longer store client objects here
        participants: {
            p1: { name: "Player 1", status: "disconnected", ready: false },
            p2: { name: "Player 2", status: "disconnected", ready: false },
            ref: { name: "Referee", status: "disconnected" }
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
            picks: { p1: [], p2: [] }
        }
    };
}


// --- DRAFT LOGIC --- (This function does not need to change)
function nextPhase(lobbyData) {
    const { draft } = lobbyData;
    switch (draft.phase) {
        case "ban":
            if (draft.step < 7) {
                draft.step++;
                draft.currentPlayer = draft.currentPlayer === "p1" ? "p2" : "p1";
            } else {
                draft.phase = "pick";
                draft.step = 0;
                const pickSeq1 = [{ p: 'p1', c: 1 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 1 }];
                const next = pickSeq1[draft.step];
                draft.currentPlayer = next.p;
                draft.action = "pick";
                draft.actionCount = next.c;
            }
            break;
        case "pick":
            const pickSeq1 = [{ p: 'p1', c: 1 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 1 }];
            if (draft.step < pickSeq1.length - 1) {
                draft.step++;
                const next = pickSeq1[draft.step];
                draft.currentPlayer = next.p;
                draft.actionCount = next.c;
            } else {
                draft.phase = "midBan";
                draft.step = 0;
                draft.currentPlayer = "p1";
                draft.action = "ban";
                draft.actionCount = 1;
            }
            break;
        case "midBan":
            if (draft.step < 5) {
                draft.step++;
                draft.currentPlayer = draft.currentPlayer === "p1" ? "p2" : "p1";
            } else {
                draft.phase = "pick2";
                draft.step = 0;
                const pickSeq2 = [{ p: 'p2', c: 1 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 1 }];
                const next = pickSeq2[draft.step];
                draft.currentPlayer = next.p;
                draft.action = "pick";
                draft.actionCount = next.c;
            }
            break;
        case "pick2":
            const pickSeq2 = [{ p: 'p2', c: 1 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 1 }];
            if (draft.step < pickSeq2.length - 1) {
                draft.step++;
                const next = pickSeq2[draft.step];
                draft.currentPlayer = next.p;
                draft.actionCount = next.c;
            } else {
                draft.phase = "complete";
                draft.currentPlayer = "";
            }
            break;
    }
    return lobbyData; // Return the modified data
}


// --- COMMUNICATION ---
async function broadcastState(lobbyCode) {
    const lobbyRef = firestore.collection('lobbies').doc(lobbyCode);
    const lobbyDoc = await lobbyRef.get();
    if (!lobbyDoc.exists) return;

    const lobbyData = lobbyDoc.data();
    const message = JSON.stringify({ type: 'stateUpdate', state: lobbyData });

    // Iterate over all connected clients and send the update only to those in the correct lobby
    wss.clients.forEach(client => {
        if (client.lobbyCode === lobbyCode && client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}


wss.on('connection', (ws) => {
    console.log('Client connected');

    ws.on('message', async (message) => { // This function must be async to use await
        let data;
        try {
            data = JSON.parse(message);
        } catch (e) {
            console.error('Invalid JSON received:', message);
            return;
        }

        console.log('Received:', data.type, "for lobby:", data.lobbyCode);
        const { lobbyCode, role, player, id, action } = data;
        const lobbyRef = lobbyCode ? firestore.collection('lobbies').doc(lobbyCode.toUpperCase()) : null;

        switch (data.type) {
            case 'createLobby': {
                const newLobbyCode = generateLobbyCode();
                const newLobbyState = createNewLobbyState();
                
                ws.lobbyCode = newLobbyCode;
                ws.userRole = 'ref';
                newLobbyState.participants.ref.status = "connected";

                // FIRESTORE: Save the new lobby to the database
                await firestore.collection('lobbies').doc(newLobbyCode).set(newLobbyState);

                ws.send(JSON.stringify({ type: 'lobbyCreated', code: newLobbyCode, state: newLobbyState }));
                console.log(`Lobby created: ${newLobbyCode}`);
                break;
            }

            case 'joinLobby': {
                if (!lobbyRef) return;
                const lobbyDoc = await lobbyRef.get();

                if (!lobbyDoc.exists) {
                    return ws.send(JSON.stringify({ type: 'error', message: 'Lobby not found.' }));
                }
                
                let lobbyData = lobbyDoc.data();
                // We'll add a check later to see if role is taken by another active connection
                
                ws.lobbyCode = lobbyCode.toUpperCase();
                ws.userRole = role;
                
                const updates = {};
                updates[`participants.${role}.status`] = 'connected';
                
                // FIRESTORE: Update the lobby in the database
                await lobbyRef.update(updates);
                
                // Get the updated data to send back
                const updatedLobbyDoc = await lobbyRef.get();
                
                ws.send(JSON.stringify({ type: 'lobbyJoined', lobbyCode: ws.lobbyCode, role, state: updatedLobbyDoc.data() }));
                broadcastState(ws.lobbyCode);
                break;
            }
            
            // --- ALL OTHER CASES ARE NOW CONVERTED ---

            case 'rosterSelect': {
                if (!lobbyRef) return;
                const doc = await lobbyRef.get();
                if (!doc.exists) return;
                let data = doc.data();

                if (data.participants[player].ready) return;
                const roster = data.roster[player];
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
                let data = doc.data();

                if (data.participants[player].ready) return;
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
                let data = doc.data();

                if (data.participants[player].ready) return;
                
                await lobbyRef.update({ [`roster.${player}`]: [] });
                broadcastState(lobbyCode.toUpperCase());
                break;
            }

            case 'updateReady': {
                if (!lobbyRef) return;
                const doc = await lobbyRef.get();
                if (!doc.exists) return;
                let data = doc.data();

                const currentReadyState = data.participants[player].ready;
                if (!currentReadyState && data.roster[player].length !== 42) return;
                
                await lobbyRef.update({ [`participants.${player}.ready`]: !currentReadyState });
                broadcastState(lobbyCode.toUpperCase());
                break;
            }

            case 'draftControl': {
                if (!lobbyRef || ws.userRole !== 'ref') return;
                const doc = await lobbyRef.get();
                if (!doc.exists) return;
                let data = doc.data();

                if (action === 'start') {
                    if (data.participants.p1.ready && data.participants.p2.ready) {
                        data.draft.phase = "ban";
                        data.draft.step = 0;
                        data.draft.currentPlayer = "p1";
                        data.draft.action = "ban";
                        data.draft.actionCount = 1;
                        data.draft.available.p1 = [...data.roster.p1];
                        data.draft.available.p2 = [...data.roster.p2];
                    }
                } else if (action === 'nextPhase' || action === 'complete') {
                    data = nextPhase(data);
                }
                
                await lobbyRef.update({ draft: data.draft });
                broadcastState(lobbyCode.toUpperCase());
                break;
            }

            case 'draftSelect': {
                if (!lobbyRef) return;
                const doc = await lobbyRef.get();
                if (!doc.exists) return;
                let data = doc.data();
                
                const { id } = data.payload;
                const actingPlayer = data.draft.currentPlayer;
                if (ws.userRole !== actingPlayer && ws.userRole !== 'ref') return;

                const currentAction = data.draft.action;
                if (currentAction === 'ban') {
                    data.draft.idBans[actingPlayer].push(id);
                    let p1Index = data.draft.available.p1.indexOf(id);
                    if(p1Index > -1) data.draft.available.p1.splice(p1Index, 1);
                    let p2Index = data.draft.available.p2.indexOf(id);
                    if(p2Index > -1) data.draft.available.p2.splice(p2Index, 1);
                } else if (currentAction === 'pick') {
                    data.draft.picks[actingPlayer].push(id);
                    let p1Index = data.draft.available.p1.indexOf(id);
                    if (p1Index > -1) data.draft.available.p1.splice(p1Index, 1);
                    let p2Index = data.draft.available.p2.indexOf(id);
                    if (p2Index > -1) data.draft.available.p2.splice(p2Index, 1);
                }
                
                data.draft.actionCount--;
                if (data.draft.actionCount <= 0) {
                    data = nextPhase(data);
                }
                
                await lobbyRef.update({ draft: data.draft });
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