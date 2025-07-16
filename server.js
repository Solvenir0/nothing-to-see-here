const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');
const { Firestore } = require('@google-cloud/firestore');
const fs = require('fs');

// Initialize Firestore
const firestore = new Firestore();

const app = express();
const server = http.createServer(app);

// Serve static files
app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check
app.get('/_ah/health', (req, res) => res.status(200).send('OK'));

const wss = new WebSocket.Server({ server });

// --- CONSTANTS & DATA ---
const ROSTER_SIZE = 42;
const EGO_BAN_COUNT = 5;

function createSlug(name) {
    if (!name) return '';
    return name.toLowerCase()
        .replace(/ryōshū/g, 'ryshu').replace(/öufi/g, 'ufi')
        .replace(/e\.g\.o::/g, 'ego-')
        .replace(/ & /g, ' ').replace(/[.'"]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/[^\w-]+/g, '');
}

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
        result.push({ id: createSlug(obj.Name), name: obj.Name });
    }
    return result;
}

const idCsvData = fs.readFileSync(path.join(__dirname, 'id_data.csv'), 'utf8'); // Assuming you save the CSV data into a file
const masterIDList = parseIDCSV(idCsvData);
const allIds = masterIDList.map(item => item.id);


// --- UTILITY FUNCTIONS ---
async function generateUniqueLobbyCode() {
    let code;
    let docExists;
    do {
        code = Math.random().toString(36).substring(2, 8).toUpperCase();
        const doc = await firestore.collection('lobbies').doc(code).get();
        docExists = doc.exists;
    } while (docExists);
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
            phase: "roster",
            step: 0,
            currentPlayer: "",
            action: "",
            actionCount: 0,
            available: { p1: [], p2: [] },
            idBans: { p1: [], p2: [] },
            egoBans: { p1: [], p2: [] },
            picks: { p1: [], p2: [] }
        }
    };
}

// --- DRAFT LOGIC ---
function nextPhase(lobbyData) {
    const { draft } = lobbyData;
    switch (draft.phase) {
        case "egoBan":
            if (draft.currentPlayer === 'p1' && draft.egoBans.p1.length === EGO_BAN_COUNT) {
                draft.currentPlayer = 'p2';
            } else if (draft.currentPlayer === 'p2' && draft.egoBans.p2.length === EGO_BAN_COUNT) {
                draft.phase = "ban";
                draft.step = 0;
                draft.currentPlayer = "p1";
                draft.action = "ban";
                draft.actionCount = 1;
            }
            break;
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
        try { incomingData = JSON.parse(message); } 
        catch (e) { console.error('Invalid JSON:', message); return; }

        const { lobbyCode, role, player, id, action, payload, name, egoId } = incomingData;
        const lobbyRef = lobbyCode ? firestore.collection('lobbies').doc(lobbyCode.toUpperCase()) : null;

        switch (incomingData.type) {
            case 'createLobby': {
                const newLobbyCode = await generateUniqueLobbyCode();
                const newLobbyState = createNewLobbyState();
                ws.lobbyCode = newLobbyCode;
                ws.userRole = 'ref';
                if (name) newLobbyState.participants.ref.name = name;
                newLobbyState.participants.ref.status = "connected";
                await firestore.collection('lobbies').doc(newLobbyCode).set(newLobbyState);
                ws.send(JSON.stringify({ type: 'lobbyCreated', code: newLobbyCode, state: newLobbyState }));
                break;
            }

            case 'joinLobby': {
                if (!lobbyRef) return;
                const doc = await lobbyRef.get();
                if (!doc.exists) return ws.send(JSON.stringify({ type: 'error', message: 'Lobby not found.' }));
                const lobbyData = doc.data();
                if (lobbyData.participants[role]?.status === 'connected') return ws.send(JSON.stringify({ type: 'error', message: `Role ${role.toUpperCase()} is taken.` }));
                
                ws.lobbyCode = lobbyCode.toUpperCase();
                ws.userRole = role;
                const updates = { [`participants.${role}.status`]: 'connected' };
                if (name) updates[`participants.${role}.name`] = name;
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
                if (index === -1) { if (roster.length < ROSTER_SIZE) roster.push(id); } 
                else { roster.splice(index, 1); }
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

                const shuffled = [...allIds].sort(() => 0.5 - Math.random());
                const newRoster = shuffled.slice(0, ROSTER_SIZE);
                
                await lobbyRef.update({ [`roster.${player}`]: newRoster });
                broadcastState(lobbyCode.toUpperCase());
                break;
            }

            case 'updateReady': {
                if (!lobbyRef) return;
                const doc = await lobbyRef.get();
                if (!doc.exists) return;
                let lobbyData = doc.data();
                const currentReadyState = lobbyData.participants[player].ready;
                if (!currentReadyState && lobbyData.roster[player].length !== ROSTER_SIZE) return;
                await lobbyRef.update({ [`participants.${player}.ready`]: !currentReadyState });
                broadcastState(lobbyCode.toUpperCase());
                break;
            }

            case 'egoBan': {
                if (!lobbyRef) return;
                const doc = await lobbyRef.get();
                if (!doc.exists) return;
                let lobbyData = doc.data();
                const { draft } = lobbyData;
                const { currentPlayer } = draft;

                if ((ws.userRole !== currentPlayer && ws.userRole !== 'ref') || draft.phase !== 'egoBan') return;

                const playerBans = draft.egoBans[currentPlayer];
                const allBans = [...draft.egoBans.p1, ...draft.egoBans.p2];

                if (playerBans.length < EGO_BAN_COUNT && !allBans.includes(egoId)) {
                    playerBans.push(egoId);
                    await lobbyRef.update({ [`draft.egoBans.${currentPlayer}`]: playerBans });
                    broadcastState(lobbyCode.toUpperCase());
                }
                break;
            }

            case 'draftControl': {
                if (!lobbyRef || ws.userRole !== 'ref') return;
                const doc = await lobbyRef.get();
                if (!doc.exists) return;
                let lobbyData = doc.data();

                if (action === 'startEgoBan') {
                    if (lobbyData.participants.p1.ready && lobbyData.participants.p2.ready) {
                        lobbyData.draft.phase = "egoBan";
                        lobbyData.draft.currentPlayer = "p1";
                    }
                } else if (action === 'confirmEgoBans') {
                     lobbyData = nextPhase(lobbyData);
                } else if (action === 'nextPhase' || action === 'complete') {
                    lobbyData = nextPhase(lobbyData);
                }
                
                if (lobbyData.draft.phase === 'ban' && lobbyData.draft.available.p1.length === 0) {
                     lobbyData.draft.available.p1 = [...lobbyData.roster.p1];
                     lobbyData.draft.available.p2 = [...lobbyData.roster.p2];
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
                
                const { id: selectedId } = payload;
                const actingPlayer = lobbyData.draft.currentPlayer;
                if (ws.userRole !== actingPlayer && ws.userRole !== 'ref') return;

                const currentAction = lobbyData.draft.action;
                if (currentAction === 'ban') {
                    lobbyData.draft.idBans[actingPlayer].push(selectedId);
                } else if (currentAction === 'pick') {
                    lobbyData.draft.picks[actingPlayer].push(selectedId);
                }
                
                let p1Index = lobbyData.draft.available.p1.indexOf(selectedId);
                if(p1Index > -1) lobbyData.draft.available.p1.splice(p1Index, 1);
                let p2Index = lobbyData.draft.available.p2.indexOf(selectedId);
                if(p2Index > -1) lobbyData.draft.available.p2.splice(p2Index, 1);

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

// Create a dummy id_data.csv file for the server to read
const idCsvContent = `Name,Keywords,SinAffinities,Rarity
"LCB Sinner Yi Sang","Sinking","Gloom,Envy,Sloth","0"
"Seven Association South Section 6 Yi Sang","Rupture","Gloom,Gluttony,Sloth","00"
"Molar Office Fixer Yi Sang","Discard,Tremor","Lust,Sloth,Wrath","00"
"The Pequod First Mate Yi Sang","Bleed,Poise","Pride,Envy,Gluttony","00"
"Dieci Association South Section 4 Yi Sang","Aggro,Discard,Sinking","Gluttony,Lust,Sloth","00"
"LCE E.G.O::Lantern Yi Sang","Aggro,Rupture","Sloth,Envy,Gluttony","00"
"Blade Lineage Salsu Yi Sang","Poise","Pride,Envy,Sloth","000"
"Effloresced E.G.O::Spicebush Yi Sang","Sinking,Tremor","Gluttony,Sloth,Pride","000"
"W Corp. L3 Cleanup Agent Yi Sang","Charge,Rupture","Sloth,Gluttony,Gloom","000"
"The Ring Pointillist Student Yi Sang","Bleed,Random","Gloom,Lust,Sloth","000"
"Lobotomy E.G.O::Solemn Lament Yi Sang","Ammo,Sinking","Pride,Gloom,Sloth","000"
"Liu Association South Section 3 Yi Sang","Burn","Sloth,Wrath,Envy","000"
"N Corp. E.G.O::Fell Bullet Yi Sang","Bleed,Poise","Wrath,Lust,Pride","000"
`;
fs.writeFileSync(path.join(__dirname, 'id_data.csv'), idCsvContent);


const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`Server is listening on port ${PORT}`));
