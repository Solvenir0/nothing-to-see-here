const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');
const { Firestore } = require('@google-cloud/firestore');
const fs = require('fs'); // For file system operations

// Initialize Firestore
const firestore = new Firestore();

const app = express();
const server = http.createServer(app);

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

app.use(express.static(path.join(__dirname)));
// Serve uploaded images statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check endpoint for the hosting platform
app.get('/_ah/health', (req, res) => {
  res.status(200).send('OK');
});

const wss = new WebSocket.Server({ server });

// --- DATA & UTILITY FUNCTIONS ---

// NEW: Helper function to create a URL-friendly slug from a name
function createSlug(name) {
    if (!name) return '';
    return name.toLowerCase()
        .replace(/::/g, '') // Remove special characters like ::
        .replace(/[.'"]/g, '') // Remove punctuation
        .replace(/\s+/g, '-') // Replace spaces with hyphens
        .replace(/[^\w-]+/g, ''); // Remove all other non-word chars
}

// NEW: Server-side parsing of the same CSV data to ensure consistency
function parseCSV(csv) {
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
            if (value.startsWith('"') && value.endsWith('"')) {
                value = value.slice(1, -1);
            }
            obj[header] = value;
        });
        const name = obj.Name;
        const slug = createSlug(name);
        result.push({ id: slug, name: name });
    }
    return result;
}

const csvData = `Name,Keywords,SinAffinities,Rarity
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
"LCB Sinner Faust","","Pride,Sloth,Gluttony","0"
"W Corp. L2 Cleanup Agent Faust","Charge","Envy,Gloom,Wrath","00"
"Lobotomy Corp. Remnant Faust","Poise,Rupture","Sloth,Gloom,Envy","000"
"Zwei Association South Section 4 Faust","Aggro","Envy,Gloom,Lust","00"
"Wuthering Heights Butler Faust","Sinking","Gloom,Lust,Wrath","00"
"The One Who Grips Faust","Bleed","Envy,Lust,Pride","000"
"Seven Association South Section 4 Faust","Rupture","Envy,Gloom,Gluttony","000"
"Lobotomy E.G.O::Regret Faust","Tremor","Sloth,Pride,Wrath","000"
"Blade Lineage Salsu Faust","Bleed,Poise","Sloth,Pride,Gloom","000"
"MultiCrack Office Rep Faust","Charge","Lust,Envy,Gluttony","000"
"LCE E.G.O::Ardor Blossom Star Faust","Burn","Sloth,Pride,Wrath","000"
"Heishou Pack - Mao Branch Adept Faust","Rupture","Sloth,Pride,Gluttony","000"
"LCB Sinner Don Quixote","Bleed","Lust,Envy,Gluttony","0"
"Shi Association South Section 5 Director Don Quixote","Poise","Wrath,Envy,Lust","00"
"N Corp. Mittelhammer Don Quixote","Bleed,Tremor","Lust,Gluttony,Wrath","00"
"Lobotomy E.G.O::Lantern Don Quixote","Aggro,Rupture","Gluttony,Lust,Gloom","00"
"Blade Lineage Salsu Don Quixote","Poise","Pride,Envy,Sloth","00"
"W Corp. L3 Cleanup Agent Don Quixote","Charge,Rupture","Sloth,Gloom,Envy","000"
"Cinq Association South Section 5 Director Don Quixote","","Lust,Gloom,Pride","000"
"The Middle Little Sister Don Quixote","Bleed","Wrath,Envy,Pride","000"
"T Corp. Class 3 Collection Staff Don Quixote","Aggro,Tremor","Gluttony,Pride,Sloth","000"
"The Manager of La Manchaland Don Quixote","Bleed","Sloth,Wrath,Lust","000"
"Cinq Association East Section 3 Don Quixote","Burn,Poise","Gluttony,Wrath,Pride","000"
"LCB Sinner Ryōshū","Poise","Gluttony,Lust,Pride","0"
"Seven Association South Section 6 Ryōshū","Rupture","Sloth,Pride,Gluttony","00"
"LCCB Assistant Manager Ryōshū","Ammo,Poise,Rupture,Tremor","Lust,Gluttony,Pride","00"
"Liu Association South Section 4 Ryōshū","Burn","Gluttony,Wrath,Lust","00"
"District 20 Yurodivy Ryōshū","Tremor","Lust,Sloth,Gluttony","00"
"Kurokumo Clan Wakashu Ryōshū","Bleed","Gluttony,Pride,Lust","000"
"R.B. Chef de Cuisine Ryōshū","Bleed","Wrath,Envy,Lust","000"
"W Corp. L3 Cleanup Agent Ryōshū","Charge","Lust,Pride,Envy","000"
"Edgar Family Chief Butler Ryōshū","Poise","Lust,Pride,Wrath","000"
"Lobotomy E.G.O::Red Eyes & Penitence Ryōshū","Bleed","Envy,Gloom,Lust","000"
"Heishou Pack - Mao Branch Ryōshū","Rupture","Lust,Gluttony,Pride","00"
"LCB Sinner Meursault","Tremor","Sloth,Pride,Gloom","0"
"Liu Association South Section 6 Meursault","Burn","Lust,Sloth,Wrath","00"
"Rosespanner Workshop Fixer Meursault","Charge,Tremor","Gloom,Pride,Sloth","00"
"The Middle Little Brother Meursault","Bleed","Sloth,Envy,Wrath","00"
"Dead Rabbits Boss Meursault","Rupture","Lust,Wrath,Gluttony","00"
"W Corp. L2 Cleanup Agent Meursault","Charge,Rupture","Envy,Gluttony,Pride","000"
"N Corp. Großhammer Meursault","Aggro,Bleed","Sloth,Wrath,Pride","000"
"R Corp. 4th Pack Rhino Meursault","Bleed,Charge","Envy,Gloom,Lust","000"
"Blade Lineage Mentor Meursault","Poise","Pride,Pride,Wrath","000"
"Dieci Association South Section 4 Director Meursault","Discard,Sinking","Gluttony,Sloth,Gloom","000"
"Cinq Association West Section 3 Meursault","Poise,Rupture","Pride,Gluttony,Gloom","000"
"The Thumb East Capo IIII Meursault","Ammo,Burn,Tremor","Sloth,Lust,Wrath","000"
"LCB Sinner Hong Lu","Rupture,Sinking","Pride,Sloth,Lust","0"
"Kurokumo Clan Wakashu Hong Lu","Bleed","Lust,Pride,Sloth","00"
"Liu Association South Section 5 Hong Lu","Burn","Gloom,Lust,Wrath","00"
"W Corp. L2 Cleanup Agent Hong Lu","Charge,Rupture","Pride,Wrath,Gluttony","00"
"Hook Office Fixer Hong Lu","Bleed","Wrath,Lust,Pride","00"
"Fanghunt Office Fixer Hong Lu","Rupture","Gluttony,Pride,Wrath","00"
"Tingtang Gang Gangleader Hong Lu","Bleed","Envy,Lust,Gluttony","000"
"K Corp. Class 3 Excision Staff Hong Lu","Aggro,Rupture","Pride,Gluttony,Sloth","000"
"Dieci Association South Section 4 Hong Lu","Discard,Sinking","Wrath,Gloom,Sloth","000"
"District 20 Yurodivy Hong Lu","Tremor","Gloom,Sloth,Gluttony","000"
"Full-Stop Office Rep Hong Lu","Ammo,Poise","Sloth,Gloom,Pride","000"
"R Corp. 4th Pack Reindeer Hong Lu","Charge,Sinking","Gluttony,Envy,Wrath","000"
"LCB Sinner Heathcliff","Tremor","Envy,Wrath,Lust","0"
"Shi Association South Section 5 Heathcliff","Poise","Lust,Wrath,Envy","00"
"N Corp. Kleinhammer Heathcliff","Bleed","Envy,Gloom,Lust","00"
"Seven Association South Section 4 Heathcliff","Rupture","Wrath,Envy,Gluttony","00"
"MultiCrack Office Fixer Heathcliff","Charge","Wrath,Envy,Gloom","00"
"R Corp. 4th Pack Rabbit Heathcliff","Ammo,Bleed,Rupture","Wrath,Gluttony,Envy","000"
"Lobotomy E.G.O::Sunshower Heathcliff","Rupture,Sinking,Tremor","Envy,Gloom,Sloth","000"
"The Pequod Harpooneer Heathcliff","Aggro,Bleed,Poise","Pride,Envy,Envy","000"
"Öufi Association South Section 3 Heathcliff","Tremor","Envy,Gloom,Pride","000"
"Wild Hunt Heathcliff","Sinking","Wrath,Envy,Gloom","000"
"Full-Stop Office Fixer Heathcliff","Ammo,Poise","Gloom,Envy,Pride","000"
"Kurokumo Clan Wakashu Heathcliff","Bleed","Wrath,Pride,Lust","000"
"LCB Sinner Ishmael","Tremor","Wrath,Gluttony,Gloom","0"
"Shi Association South Section 5 Ishmael","Poise","Envy,Lust,Wrath","00"
"LCCB Assistant Manager Ishmael","Aggro,Rupture,Tremor","Gluttony,Gloom,Pride","00"
"Lobotomy E.G.O::Sloshing Ishmael","Aggro,Rupture,Tremor","Gloom,Wrath,Gluttony","00"
"Edgar Family Butler Ishmael","Poise,Sinking","Sloth,Gluttony,Gloom","00"
"R Corp. 4th Pack Reindeer Ishmael","Charge,Sinking","Gloom,Envy,Wrath","000"
"Liu Association South Section 4 Ishmael","Burn","Lust,Wrath,Envy","000"
"Molar Boatworks Fixer Ishmael","Sinking,Tremor","Pride,Sloth,Gloom","000"
"The Pequod Captain Ishmael","Aggro,Bleed,Burn","Envy,Pride,Wrath","000"
"Zwei Association West Section 3 Ishmael","Aggro,Tremor","Pride,Envy,Gluttony","000"
"Kurokumo Clan Captain Ishmael","Bleed","Envy,Pride,Lust","000"
"Family Hierarch Candidate Ishmael","Poise,Rupture","Gloom,Gluttony,Envy","000"
"LCB Sinner Rodion","Bleed","Gluttony,Pride,Wrath","0"
"LCCB Assistant Manager Rodion","","Pride,Gluttony,Envy","00"
"N Corp. Mittelhammer Rodion","Bleed","Pride,Lust,Wrath","00"
"Zwei Association South Section 5 Rodion","Aggro,Poise","Wrath,Sloth,Gloom","00"
"T Corp. Class 2 Collection Staff Rodion","Tremor","Envy,Wrath,Sloth","00"
"Kurokumo Clan Wakashu Rodion","Bleed,Poise","Gluttony,Lust,Pride","000"
"Rosespanner Workshop Rep Rodion","Charge,Tremor","Pride,Gloom,Envy","000"
"Dieci Association South Section 4 Rodion","Aggro,Discard,Sinking","Gloom,Envy,Sloth","000"
"Liu Association South Section 4 Director Rodion","Burn","Pride,Wrath,Lust","000"
"Devyat' Association North Section 3 Rodion","Rupture","Lust,Wrath,Gluttony","000"
"The Princess of La Manchaland Rodion","Bleed,Rupture","Pride,Envy,Lust","000"
"Heishou Pack - Si Branch Rodion","Poise,Rupture","Envy,Gluttony,Gloom","000"
"LCB Sinner Sinclair","Rupture","Pride,Wrath,Envy","0"
"Zwei Association South Section 6 Sinclair","Aggro,Tremor","Gloom,Wrath,Sloth","00"
"Los Mariachis Jefe Sinclair","Poise,Sinking","Sloth,Envy,Gloom","00"
"Lobotomy E.G.O::Red Sheet Sinclair","Rupture","Gluttony,Pride,Lust","00"
"Molar Boatworks Fixer Sinclair","Tremor","Gloom,Envy,Gluttony","00"
"Zwei Association West Section 3 Sinclair","Aggro,Tremor","Lust,Gloom,Sloth","00"
"Blade Lineage Salsu Sinclair","Bleed,Poise","Gluttony,Wrath,Pride","000"
"The One Who Shall Grip Sinclair","Bleed,Burn","Gloom,Lust,Wrath","000"
"Cinq Association South Section 4 Director Sinclair","Poise","Gluttony,Pride,Lust","000"
"Dawn Office Fixer Sinclair","Bleed","Gloom,Envy,Wrath","000"
"Devyat' Association North Section 3 Sinclair","Rupture","Lust,Gluttony,Wrath","000"
"The Middle Little Brother Sinclair","Aggro,Bleed","Lust,Gluttony,Wrath","000"
"The Thumb East Soldato II Sinclair","Ammo,Burn,Tremor","Lust,Sloth,Wrath","000"
"LCB Sinner Outis","Rupture","Sloth,Pride,Gloom","0"
"Blade Lineage Salsu Outis","Poise","Wrath,Lust,Pride","00"
"G Corp. Head Manager Outis","Sinking","Sloth,Gluttony,Gloom","00"
"Cinq Association South Section 4 Outis","Aggro,Poise","Pride,Gloom,Lust","00"
"The Ring Pointillist Student Outis","Bleed,Random","Lust,Wrath,Gluttony","00"
"Seven Association South Section 6 Director Outis","Rupture","Gluttony,Sloth,Lust","000"
"Molar Office Fixer Outis","Discard,Tremor","Wrath,Lust,Sloth","000"
"Lobotomy E.G.O::Magic Bullet Outis","Burn","Wrath,Pride,Pride","000"
"Wuthering Heights Chief Butler Outis","Sinking","Pride,Gloom,Lust","000"
"W Corp. L3 Cleanup Captain Outis","Charge,Rupture","Pride,Envy,Gloom","000"
"The Barber of La Manchaland Outis","Bleed","Gluttony,Lust,Wrath","000"
"Heishou Pack - Mao Branch Outis","Rupture","Sloth,Gluttony,Gloom","000"
"LCB Sinner Gregor","Rupture","Gloom,Gluttony,Sloth","0"
"Liu Association South Section 6 Gregor","Burn","Wrath,Lust,Sloth","00"
"R.B. Sous-chef Gregor","Bleed","Lust,Gluttony,Envy","00"
"Rosespanner Workshop Fixer Gregor","Rupture,Tremor","Gluttony,Envy,Gloom","00"
"Kurokumo Clan Captain Gregor","Bleed","Sloth,Lust,Gloom","00"
"Lobotomy E.G.O::Lantern Gregor","Aggro,Burn","Wrath,Sloth,Gloom","00"
"G Corp. Manager Corporal Gregor","Rupture","Gluttony,Sloth,Lust","000"
"Zwei Association South Section 4 Gregor","Aggro","Sloth,Gluttony,Gloom","000"
"Twinhook Pirates First Mate Gregor","Ammo,Bleed,Poise","Sloth,Pride,Gloom","000"
"Edgar Family Heir Gregor","Sinking","Envy,Pride,Lust","000"
"The Priest of La Manchaland Gregor","Aggro,Bleed,Rupture","Gluttony,Pride,Lust","000"
"Firefist Office Survivor Gregor","Burn","Lust,Wrath,Wrath","000"
"Heishou Pack - Si Branch Gregor","Poise,Rupture","Pride,Gluttony,Envy","000"
`;
const masterIDList = parseCSV(csvData);
const allIds = masterIDList.map(item => item.id); // This will be an array of slugs

async function generateUniqueLobbyCode() {
    let code;
    let docExists = true;
    do {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        const lobbyRef = firestore.collection('lobbies').doc(code);
        const doc = await lobbyRef.get();
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
            phase: "roster", step: 0, currentPlayer: "", action: "", actionCount: 0,
            available: { p1: [], p2: [] }, idBans: { p1: [], p2: [] }, picks: { p1: [], p2: [] }
        }
    };
}

// --- DRAFT LOGIC ---
function nextPhase(lobbyData) {
    const { draft } = lobbyData;
    // This logic remains the same
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

        const { lobbyCode, role, player, id, action, payload, name } = incomingData;
        const lobbyRef = lobbyCode ? firestore.collection('lobbies').doc(lobbyCode.toUpperCase()) : null;

        switch (incomingData.type) {
            case 'createLobby': {
                const newLobbyCode = await generateUniqueLobbyCode();
                const newLobbyState = createNewLobbyState();
                
                ws.lobbyCode = newLobbyCode;
                ws.userRole = 'ref';
                
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
                if (!doc.exists) {
                    return ws.send(JSON.stringify({ type: 'error', message: 'Lobby not found.' }));
                }

                const lobbyData = doc.data();
                // MODIFIED: Check if the role is already taken
                if (lobbyData.participants[role] && lobbyData.participants[role].status === 'connected') {
                    return ws.send(JSON.stringify({ type: 'error', message: `Role ${role.toUpperCase()} is already taken.` }));
                }
                
                ws.lobbyCode = lobbyCode.toUpperCase();
                ws.userRole = role;
                
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

                // MODIFIED: Use the server's list of all possible IDs (slugs)
                const shuffled = [...allIds].sort(() => 0.5 - Math.random());
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
                
                const { id: selectedId } = payload;
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
