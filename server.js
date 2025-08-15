// =================================================================================
// FILE: server.js
// DESCRIPTION: This version adds basic security hardening for public use.
// 1. Input Sanitization: Player names are now sanitized to prevent XSS attacks.
// 2. Rate Limiting: A simple in-memory rate limit is added to the lobby
//    creation process to prevent spam and abuse.
// =================================================================================
const express = require('express');
const http = require('http');
const path =require('path');
const WebSocket = require('ws');
const crypto = require('crypto');

// In-memory storage for lobbies instead of Firestore
const lobbies = {};
const VALID_ROLES = new Set(['p1', 'p2', 'ref']);

// Helper function to validate roster
function validateRoster(roster, rosterSize) {
    if (!Array.isArray(roster)) return false;
    const sizeOk = roster.length === rosterSize;
    const uniqueOk = new Set(roster).size === roster.length;
    const idsOk = roster.every(x => allIds.includes(x));
    return sizeOk && uniqueOk && idsOk;
}

// Helper function to send error responses consistently
function sendError(ws, message) {
    ws.send(JSON.stringify({ type: 'error', message }));
}

// Enhanced logging utility with consistent formatting
function logInfo(category, message, data = null) {
    const timestamp = new Date().toISOString();
    const logMessage = data 
        ? `[${timestamp}] ${category}: ${message} ${JSON.stringify(data)}`
        : `[${timestamp}] ${category}: ${message}`;
    console.log(logMessage);
}

function logError(category, message, error = null) {
    const timestamp = new Date().toISOString();
    const logMessage = error 
        ? `[${timestamp}] ERROR ${category}: ${message} ${error}`
        : `[${timestamp}] ERROR ${category}: ${message}`;
    console.error(logMessage);
}

// Validation helper functions to reduce repetition
function validateLobbyExists(ws, lobbyData, sendErrorOnFail = false) {
    if (!lobbyData) {
        if (sendErrorOnFail && ws) {
            sendError(ws, 'Lobby not found.');
        }
        return false;
    }
    return true;
}

function validatePlayerRole(player) {
    return VALID_ROLES.has(player) && player !== 'ref';
}

function validatePlayerAccess(ws, player, lobbyData) {
    return validateLobbyExists(null, lobbyData) && 
           validatePlayerRole(player) && 
           isAuthorized(ws, player);
}

function validatePlayerNotReady(lobbyData, player) {
    return lobbyData.participants[player] && !lobbyData.participants[player].ready;
}

function validateRefereeAccess(ws, lobbyData) {
    return validateLobbyExists(null, lobbyData) && ws.userRole === 'ref';
}

const app = express();
const server = http.createServer(app);

// Minimal hardening
app.disable('x-powered-by');

app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.get('/_ah/health', (req, res) => res.status(200).send('OK'));

const wss = new WebSocket.Server({ server });

const EGO_BAN_COUNT = 5;
const TIMERS = {
    roster: 90,
    egoBan: 90,
    pick: 15,
};

// --- DRAFT LOGIC SEQUENCES ---
const DRAFT_LOGIC = {
    '1-2-2': {
        ban1Steps: 8,
        pick1: [{ p: 'p1', c: 1 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 1 }],
        midBanSteps: 6,
        // Phase 2 (pick2) starts with p2 - the player who goes second during phase 1 goes first during phase 2
        pick2: [{ p: 'p2', c: 1 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 1 }],
        pick_s2: [{ p: 'p1', c: 1 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 1 }]
    },
    '1-2-2-extended': { // For "All Sections" matches
        ban1Steps: 8,
        pick1: [{ p: 'p1', c: 1 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 1 }],
        midBanSteps: 8, // Increased to 8
        pick2: [ // Starts with p2 now - the player who goes second during phase 1 goes first during phase 2
            { p: 'p2', c: 1 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 },
            { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 },
            { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 },
            { p: 'p2', c: 1 }
        ],
    },
    '2-3-2': {
        ban1Steps: 8,
        pick1: [{ p: 'p1', c: 2 }, { p: 'p2', c: 3 }, { p: 'p1', c: 2 }, { p: 'p2', c: 3 }, { p: 'p1', c: 2 }],
        midBanSteps: 6,
        pick2: [{ p: 'p2', c: 2 }, { p: 'p1', c: 3 }, { p: 'p2', c: 2 }, { p: 'p1', c: 3 }, { p: 'p2', c: 2 }],
        pick_s2: [{ p: 'p1', c: 1 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 1 }]
    },
    '2-3-2-extended': { // For "All Sections" matches
        ban1Steps: 8,
        pick1: [{ p: 'p1', c: 2 }, { p: 'p2', c: 3 }, { p: 'p1', c: 2 }, { p: 'p2', c: 3 }, { p: 'p1', c: 2 }],
        midBanSteps: 8, // Increased to 8
        pick2: [ // Starts with p2 now - the player who goes second during phase 1 goes first during phase 2
            { p: 'p2', c: 1 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 },
            { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 },
            { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 },
            { p: 'p2', c: 1 }
        ],
    }
};

const lobbyTimers = {}; // Store { lobbyCode: { timeoutId, unpauseFn } }

// --- SECURITY UTILITIES ---
function sanitize(text) {
    if (!text) return "";
    return text.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Enhanced player name sanitization with length limits and additional validation
function sanitizePlayerName(name) {
    if (!name || typeof name !== 'string') return "";
    
    // Trim whitespace and limit length to 16 characters
    const trimmed = name.trim().slice(0, 16);
    
    // Remove any control characters and excessive whitespace
    const cleaned = trimmed.replace(/[\x00-\x1F\x7F]/g, '').replace(/\s+/g, ' ');
    
    // Apply basic HTML sanitization
    return sanitize(cleaned);
}

const rateLimit = {};
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // Max 10 lobby creations per minute per IP

function createSlug(name) {
    if (!name) return '';
    return name.toLowerCase()
        .replace(/ryōshū/g, 'ryshu').replace(/öufi/g, 'ufi')
        .replace(/e\.g\.o::/g, 'ego-')
        .replace(/ & /g, ' ').replace(/[.'"]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/[^\w-]+/g, '');
}

// Minimal ID catalog: we only need slugs server-side to validate rosters and picks.
// Keep it in sync with client data.js by reusing the same CSV string via build-time copy.
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
            result.push({ 
                id: createSlug(name), 
                name: name,
                rarity: obj.Rarity,
            });
    }
    return result;
}

    // Keep a single source of truth for ID CSV below.

// Reuse the CSV from client (data.js) by embedding the same content here so the server can validate
// rosters/picks authoritatively. Long-term, consider moving this to a shared file (e.g., ids.csv or ids.json).
const idCsvData = `Name,Keywords,SinAffinities,Rarity
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
"Lobotomy E.G.O::In the Name of Love and Hate Don Quixote","Rupture,Sinking","Wrath,Envy,Envy","000"
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
"Lobotomy E.G.O::The Sword Sharpened with Tears Rodion","Sinking","Gloom,Envy,Pride","000"
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
"Liu Association South Section 6 Gregor","Burn","Wrath,Lust,Sloth","00"
"R.B. Sous-chef Gregor","Bleed","Lust,Gluttony,Envy","00"
"Rosespanner Workshop Fixer Gregor","Rupture,Tremor","Gluttony,Envy,Gloom","00"
"Kurokumo Clan Captain Gregor","Bleed","Sloth,Lust,Gloom","00"
"G Corp. Manager Corporal Gregor","Rupture","Gluttony,Sloth,Lust","000"
"Zwei Association South Section 4 Gregor","Aggro","Sloth,Gluttony,Gloom","000"
"Twinhook Pirates First Mate Gregor","Ammo,Bleed,Poise","Sloth,Pride,Gloom","000"
"Edgar Family Heir Gregor","Sinking","Envy,Pride,Lust","000"
"The Priest of La Manchaland Gregor","Aggro,Bleed,Rupture","Gluttony,Pride,Lust","000"
"Firefist Office Survivor Gregor","Burn","Lust,Wrath,Wrath","000"
"Heishou Pack - Si Branch Gregor","Poise,Rupture","Pride,Gluttony,Envy","000"`;
const masterIDList = parseIDCSV(idCsvData);
const allIds = Object.freeze(masterIDList.map(item => item.id));


function generateUniqueLobbyCode() {
    let code;
    do {
        code = Math.random().toString(36).substring(2, 8).toUpperCase();
    } while (lobbies[code]);
    return code;
}

function createNewLobbyState(options = {}) {
    const { draftLogic = '1-2-2', timerEnabled = false, name = 'Referee', matchType = 'section1', rosterSize = 42 } = options;
    return {
        hostName: sanitizePlayerName(name), // Enhanced sanitization for name on creation
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        participants: {
            p1: { name: "Player 1", status: "disconnected", ready: false, rejoinToken: null, reserveTime: 120 },
            p2: { name: "Player 2", status: "disconnected", ready: false, rejoinToken: null, reserveTime: 120 },
            ref: { name: sanitizePlayerName(name), status: "disconnected", rejoinToken: null }
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
            // Authoritative server-side view of bannable opponent IDs for each player.
            // banPools.p1: IDs p1 may ban (derived from roster.p2 minus bans & p2 picks)
            // banPools.p2: IDs p2 may ban (derived from roster.p1 minus bans & p1 picks)
            banPools: { p1: [], p2: [] },
            draftLogic,
            matchType,
            rosterSize: parseInt(rosterSize, 10),
            coinFlipWinner: null,
            timer: {
                enabled: timerEnabled,
                running: false,
                paused: false,
                endTime: 0,
                pauseTime: 0,
                isReserve: false,
                reserveStartTime: 0
            }
        }
    };
}

function broadcastState(lobbyCode, rolesSwapped = false) {
    const lobbyData = lobbies[lobbyCode];
    if (!lobbyData) return;

    wss.clients.forEach(client => {
        if (client.lobbyCode === lobbyCode && client.readyState === WebSocket.OPEN) {
            const message = {
                type: 'stateUpdate',
                state: lobbyData
            };

            if (rolesSwapped) {
                if (client.initialUserRole === 'p1') {
                    message.newRole = 'p2';
                } else if (client.initialUserRole === 'p2') {
                    message.newRole = 'p1';
                }
            }
            client.send(JSON.stringify(message));
        }
    });
}

function updateLobbyActivity(lobbyCode) {
    if (lobbies[lobbyCode]) {
        lobbies[lobbyCode].lastActivity = new Date().toISOString();
    }
}

function isAuthorized(ws, targetRole) {
    // Referee can act for anyone; a player can only act for themselves
    return ws && (ws.userRole === 'ref' || ws.userRole === targetRole);
}

function handleTimer(lobbyCode) {
    let lobbyData = lobbies[lobbyCode];
    if (!lobbyData) return;

    const { draft } = lobbyData;
    const { currentPlayer } = draft;
    const participant = lobbyData.participants[currentPlayer];

    if (participant && participant.reserveTime > 0 && !draft.timer.isReserve) {
        logInfo('TIMER', `Main timer expired for ${currentPlayer}. Activating reserve time.`, { lobbyCode, currentPlayer });
        draft.timer.isReserve = true;
        draft.timer.reserveStartTime = Date.now();
        
        const reserveDuration = participant.reserveTime;
        draft.timer.running = true;
        draft.timer.endTime = Date.now() + reserveDuration * 1000;

        const timeoutId = setTimeout(() => handleTimer(lobbyCode), reserveDuration * 1000);
        lobbyTimers[lobbyCode] = { timeoutId };
        
        broadcastState(lobbyCode);
        return;
    }
    
    draft.timer.isReserve = false;
    draft.timer.running = false;
    if (participant) {
        participant.reserveTime = 0;
    }

    const { hovered, phase } = draft;
    const hoveredId = hovered[currentPlayer];

    logInfo('TIMER', `Timer fully expired`, { lobbyCode, currentPlayer, phase, hoveredId });
    
    if (hoveredId) {
        handleDraftConfirm(lobbyCode, lobbyData, null);
        return;
    }

    logInfo('TIMER', 'Timer expired with no hover. Skipping turn by advancing phase.', { lobbyCode, currentPlayer });
    lobbyData = advancePhase(lobbyData);
    setTimerForLobby(lobbyCode, lobbyData);
    broadcastState(lobbyCode);
}


function setTimerForLobby(lobbyCode, lobbyData) {
    if (lobbyTimers[lobbyCode] && lobbyTimers[lobbyCode].timeoutId) {
        clearTimeout(lobbyTimers[lobbyCode].timeoutId);
    }
    
    const { draft } = lobbyData;
    draft.timer.isReserve = false;

    if (!draft.timer.enabled || draft.phase === 'complete' || draft.timer.paused) {
        draft.timer.running = false;
        return;
    }

    let duration = 0;
    if (draft.phase === 'roster') {
        duration = TIMERS.roster;
    } else if (draft.phase === 'egoBan') {
        duration = TIMERS.egoBan;
    } else if (['pick', 'ban', 'midBan', 'pick2'].includes(draft.phase)) {
        duration = TIMERS.pick * draft.actionCount;
    }

    if (duration > 0) {
        draft.timer.running = true;
        draft.timer.endTime = Date.now() + duration * 1000;

        const timeoutId = setTimeout(() => handleTimer(lobbyCode), duration * 1000);
        lobbyTimers[lobbyCode] = { timeoutId };
    } else {
         draft.timer.running = false;
    }
}

function advancePhase(lobbyData) {
    const { draft } = lobbyData;
    draft.timer.isReserve = false;
    
    const logicKey = draft.matchType === 'allSections' ? `${draft.draftLogic}-extended` : draft.draftLogic;
    const logic = DRAFT_LOGIC[logicKey] || DRAFT_LOGIC[draft.draftLogic];


    switch (draft.phase) {
        case "egoBan":
            if (draft.currentPlayer === 'p1') {
                draft.currentPlayer = 'p2';
            } else {
                draft.phase = "ban";
                draft.action = "ban";
                draft.step = 0;
                draft.currentPlayer = 'p1';
                draft.actionCount = 1;
                draft.available.p1 = [...lobbyData.roster.p1];
                draft.available.p2 = [...lobbyData.roster.p2];
                computeBanPools(lobbyData); // initialize ban pools for initial ban phase
            }
            break;
        case "ban":
            if (draft.step < logic.ban1Steps - 1) {
                draft.step++;
                draft.currentPlayer = draft.currentPlayer === 'p1' ? 'p2' : 'p1';
                draft.actionCount = 1;
            } else {
                draft.phase = "pick";
                draft.action = "pick";
                draft.step = 0;
                const next = logic.pick1[0];
                draft.currentPlayer = next.p;
                draft.actionCount = next.c;
            }
            break;
        case "pick":
            if (draft.step < logic.pick1.length - 1) {
                draft.step++;
                const next = logic.pick1[draft.step];
                draft.currentPlayer = next.p;
                draft.actionCount = next.c;
            } else {
                draft.phase = "midBan";
                draft.action = "midBan";
                draft.step = 0;
                draft.currentPlayer = 'p2';
                draft.actionCount = 1;
                computeBanPools(lobbyData); // refresh ban pools for mid-ban phase
            }
            break;
        case "midBan":
             if (draft.step < logic.midBanSteps - 1) {
                draft.step++;
                draft.currentPlayer = draft.currentPlayer === 'p1' ? 'p2' : 'p1';
                draft.actionCount = 1;
            } else {
                draft.phase = "pick2";
                draft.action = "pick2";
                draft.step = 0;
                const next = logic.pick2[0];
                draft.currentPlayer = next.p;
                draft.actionCount = next.c;
            }
            break;
        case "pick2":
            if (draft.step < logic.pick2.length - 1) {
                draft.step++;
                const next = logic.pick2[draft.step];
                draft.currentPlayer = next.p;
                draft.actionCount = next.c;
            } else {
                draft.phase = "complete";
                draft.action = "complete";
                draft.currentPlayer = "";
            }
            break;
        case "pick_s2":
            if (draft.step < logic.pick_s2.length - 1) {
                draft.step++;
                const next = logic.pick_s2[draft.step];
                draft.currentPlayer = next.p;
                draft.actionCount = next.c;
            } else {
                draft.phase = "complete";
                draft.action = "complete";
                draft.currentPlayer = "";
            }
            break;
    }
    return lobbyData;
}

// Recompute the bannable pools for each player based on current rosters, bans, and opponent picks.
function computeBanPools(lobbyData) {
    if (!lobbyData || !lobbyData.draft) return;
    const { draft, roster } = lobbyData;
    const banned = new Set([...draft.idBans.p1, ...draft.idBans.p2]);
    const pools = { p1: [], p2: [] };
    
    ['p1','p2'].forEach(player => {
        const opponent = player === 'p1' ? 'p2' : 'p1';
        const blocked = new Set([
            ...banned,
            ...draft.picks[opponent],
            ...draft.picks_s2[opponent]
        ]);
        pools[player] = (roster[opponent] || []).filter(id => !blocked.has(id));
    });
    draft.banPools = pools;
}

function handleDraftConfirm(lobbyCode, lobbyData, ws) {
    const { draft } = lobbyData;
    const { currentPlayer, hovered, phase } = draft;
    const selectedId = hovered[currentPlayer];
    const participant = lobbyData.participants[currentPlayer];

    if (!selectedId) return;
    
    if (ws && ws.userRole !== currentPlayer && ws.userRole !== 'ref') return;

    // For ID phases, ensure the selection is currently available from the right pool
    if (['ban', 'pick', 'midBan', 'pick2', 'pick_s2'].includes(phase)) {
        const isBanAction = (phase === 'ban' || phase === 'midBan');
        if (isBanAction) {
            const targetPlayer = currentPlayer === 'p1' ? 'p2' : 'p1';
            const opponentRoster = lobbyData.roster[targetPlayer] || [];
            // For ban visibility/validation we only need to exclude IDs already banned by either side
            // or already picked by the OPPONENT (can't ban something they've locked in). We no longer
            // exclude IDs the current player has picked; showing them in the list helps satisfy the
            // requirement to display the opponent's full remaining roster (even if banning them is redundant).
            const blocked = new Set([
                ...draft.idBans.p1,
                ...draft.idBans.p2,
                ...draft.picks[targetPlayer],
                ...draft.picks_s2[targetPlayer]
            ]);
            if (!opponentRoster.includes(selectedId) || blocked.has(selectedId)) {
                return; // Invalid ban attempt
            }
        } else {
            const sourceList = draft.available[currentPlayer] || [];
            if (!sourceList.includes(selectedId)) return;
        }
    }

    if (draft.timer.isReserve) {
        if (lobbyTimers[lobbyCode]) clearTimeout(lobbyTimers[lobbyCode].timeoutId);
        const timeUsed = Math.ceil((Date.now() - draft.timer.reserveStartTime) / 1000);
        participant.reserveTime = Math.max(0, participant.reserveTime - timeUsed);
        draft.timer.isReserve = false;
        draft.timer.reserveStartTime = 0;
    }

    if (phase === 'egoBan') {
        const playerBans = draft.egoBans[currentPlayer];
        const banIndex = playerBans.indexOf(selectedId);
        
        if (banIndex > -1) {
            playerBans.splice(banIndex, 1);
        } else if (playerBans.length < EGO_BAN_COUNT) {
            playerBans.push(selectedId);
        }
    } else if (['ban', 'pick', 'midBan', 'pick2', 'pick_s2'].includes(phase)) {
        if (draft.actionCount <= 0) return;

        let listToUpdate;
        const isBanAction = (phase === 'ban' || phase === 'midBan');

        if (isBanAction) {
            listToUpdate = draft.idBans[currentPlayer];
        } else if (phase === 'pick' || phase === 'pick2') {
            listToUpdate = draft.picks[currentPlayer];
        } else if (phase === 'pick_s2') {
            listToUpdate = draft.picks_s2[currentPlayer];
        }

        if (listToUpdate) listToUpdate.push(selectedId);
        // Always remove the chosen ID from both availability lists (bans deny globally; picks lock globally)
        ['p1','p2'].forEach(p => {
            const idx = draft.available[p].indexOf(selectedId);
            if (idx > -1) draft.available[p].splice(idx, 1);
        });
        
        draft.actionCount--;

        if (draft.actionCount <= 0) {
            lobbyData = advancePhase(lobbyData);
        }
    }

    draft.hovered[currentPlayer] = null;
    updateLobbyActivity(lobbyCode);

    if (phase !== 'egoBan') {
        setTimerForLobby(lobbyCode, lobbyData);
    }
    
    broadcastState(lobbyCode);
}

// --- MAIN WEBSOCKET LOGIC ---
wss.on('connection', (ws, req) => {
    // Use the remote address from the underlying socket for rate limiting
    ws.remoteAddress = req.socket.remoteAddress;
    logInfo('CONNECTION', 'Client connected', { remoteAddress: ws.remoteAddress });

    ws.on('message', (message) => {
        let incomingData;
        try { incomingData = JSON.parse(message); } 
        catch (e) { logError('WEBSOCKET', 'Invalid JSON received', message); return; }

    const { lobbyCode: rawLobbyCode, role, player, id, action, payload, name, roster, options, choice } = incomingData;
        const lobbyCode = rawLobbyCode ? rawLobbyCode.toUpperCase() : null;
        let lobbyData = lobbyCode ? lobbies[lobbyCode] : null;

        switch (incomingData.type) {
            case 'createLobby': {
                const ip = ws.remoteAddress;
                const now = Date.now();
                rateLimit[ip] = (rateLimit[ip] || []).filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW);

                if (rateLimit[ip].length >= RATE_LIMIT_MAX_REQUESTS) {
                    return sendError(ws, 'You are creating lobbies too quickly. Please wait.');
                }
                rateLimit[ip].push(now);

                const newLobbyCode = generateUniqueLobbyCode();
                const newLobbyState = createNewLobbyState(options);
                ws.lobbyCode = newLobbyCode;
                ws.userRole = 'ref';
                ws.initialUserRole = 'ref';
                const rejoinToken = crypto.randomUUID();
                
                newLobbyState.participants.ref.status = "connected";
                newLobbyState.participants.ref.rejoinToken = rejoinToken;
                ws.rejoinToken = rejoinToken;
                
                lobbies[newLobbyCode] = newLobbyState;
                
                ws.send(JSON.stringify({ type: 'lobbyCreated', code: newLobbyCode, role: 'ref', rejoinToken, state: newLobbyState }));
                setTimerForLobby(newLobbyCode, newLobbyState);
                broadcastState(newLobbyCode);
                break;
            }

            
            case 'getLobbyInfo': {
                if (!lobbyData) return sendError(ws, 'Lobby not found.');
                ws.send(JSON.stringify({
                    type: 'lobbyInfo',
                    lobby: {
                        code: lobbyCode,
                        participants: lobbyData.participants,
                    }
                }));
                break;
            }

            case 'joinLobby': {
                if (!lobbyData) return sendError(ws, 'Lobby not found.');
                if (!VALID_ROLES.has(role)) return sendError(ws, 'Invalid role.');
                
                const participant = lobbyData.participants[role];

                if (participant && (participant.status === 'connected' || participant.rejoinToken)) {
                    return sendError(ws, `Role ${role.toUpperCase()} is taken or reserved.`);
                }
                
                ws.lobbyCode = lobbyCode;
                ws.userRole = role;
                ws.initialUserRole = role; // Store the initial role for swapping
                const rejoinToken = crypto.randomUUID();

                lobbyData.participants[role].status = 'connected';
                lobbyData.participants[role].rejoinToken = rejoinToken;
                if (name) lobbyData.participants[role].name = sanitizePlayerName(name); // Enhanced sanitization for name on join
                ws.rejoinToken = rejoinToken;
                
                updateLobbyActivity(lobbyCode);
                
                ws.send(JSON.stringify({ 
                    type: 'lobbyJoined', 
                    lobbyCode: ws.lobbyCode, 
                    role, 
                    rejoinToken,
                    state: lobbyData 
                }));
                broadcastState(ws.lobbyCode);
                break;
            }

            case 'rejoinLobby': {
                if (!lobbyData || !role || !incomingData.rejoinToken) return;
                
                const participant = lobbyData.participants[role];

                if (participant && participant.rejoinToken === incomingData.rejoinToken) {
                    ws.lobbyCode = lobbyCode;
                    ws.userRole = role;
                    ws.initialUserRole = role;
                    ws.rejoinToken = incomingData.rejoinToken;

                    lobbyData.participants[role].status = 'connected';
                    updateLobbyActivity(lobbyCode);
                    
                    ws.send(JSON.stringify({
                        type: 'lobbyJoined',
                        lobbyCode: ws.lobbyCode,
                        role,
                        rejoinToken: incomingData.rejoinToken,
                        state: lobbyData
                    }));
                    broadcastState(lobbyCode);
                } else {
                    sendError(ws, 'Failed to rejoin. Session might be invalid.');
                }
                break;
            }

            case 'rosterSelect': {
                if (!validatePlayerAccess(ws, player, lobbyData)) return;
                if (!validatePlayerNotReady(lobbyData, player)) return;
                const currentRoster = lobbyData.roster[player];
                const index = currentRoster.indexOf(id);
                if (index === -1) { if (currentRoster.length < lobbyData.draft.rosterSize) currentRoster.push(id); } 
                else { currentRoster.splice(index, 1); }
                updateLobbyActivity(lobbyCode);
                broadcastState(lobbyCode);
                break;
            }
            
            case 'rosterSet': {
                if (!validatePlayerAccess(ws, player, lobbyData)) return;
                if (!validatePlayerNotReady(lobbyData, player)) return;
                // Validate roster using helper function
                if (validateRoster(roster, lobbyData.draft.rosterSize)) {
                    lobbyData.roster[player] = roster;
                    updateLobbyActivity(lobbyCode);
                    broadcastState(lobbyCode);
                }
                break;
            }

            case 'rosterRandomize': {
                if (!validatePlayerAccess(ws, player, lobbyData)) return;
                if (!validatePlayerNotReady(lobbyData, player)) return;
                const shuffled = [...allIds].sort(() => 0.5 - Math.random());
                lobbyData.roster[player] = shuffled.slice(0, lobbyData.draft.rosterSize);
                updateLobbyActivity(lobbyCode);
                broadcastState(lobbyCode);
                break;
            }

            case 'rosterClear': {
                if (!validatePlayerAccess(ws, player, lobbyData)) return;
                lobbyData.roster[player] = [];
                lobbyData.participants[player].ready = false;
                updateLobbyActivity(lobbyCode);
                broadcastState(lobbyCode);
                break;
            }

            case 'updateReady': {
                if (!validatePlayerAccess(ws, player, lobbyData)) return;
                const currentReadyState = lobbyData.participants[player].ready;
                if (!currentReadyState && lobbyData.roster[player].length !== lobbyData.draft.rosterSize) return;
                lobbyData.participants[player].ready = !currentReadyState;
                updateLobbyActivity(lobbyCode);
                broadcastState(lobbyCode);
                break;
            }

            case 'startCoinFlip': {
                if (!validateRefereeAccess(ws, lobbyData)) return;
                lobbyData.draft.phase = 'coinFlip';
                lobbyData.draft.coinFlipWinner = Math.random() < 0.5 ? 'p1' : 'p2';
                updateLobbyActivity(lobbyCode);
                broadcastState(lobbyCode);
                break;
            }

            case 'setTurnOrder': {
                if (!lobbyData || (ws.userRole !== lobbyData.draft.coinFlipWinner && ws.userRole !== 'ref')) return;
                
                const { draft } = lobbyData;
                let rolesSwapped = false;
                const needsSwap = (draft.coinFlipWinner === 'p2' && choice === 'first') || (draft.coinFlipWinner === 'p1' && choice === 'second');

                if (needsSwap) {
                    logInfo('DRAFT', 'Swapping P1 and P2 roles and data', { lobbyCode, coinFlipWinner: draft.coinFlipWinner, choice });
                    rolesSwapped = true;
                    [lobbyData.participants.p1, lobbyData.participants.p2] = [lobbyData.participants.p2, lobbyData.participants.p1];
                    [lobbyData.roster.p1, lobbyData.roster.p2] = [lobbyData.roster.p2, lobbyData.roster.p1];

                    wss.clients.forEach(client => {
                        if (client.lobbyCode === lobbyCode) {
                            if (client.userRole === 'p1') client.userRole = 'p2';
                            else if (client.userRole === 'p2') client.userRole = 'p1';
                        }
                    });
                }
                
                draft.phase = 'egoBan';
                draft.action = 'egoBan';
                draft.currentPlayer = 'p1';

                updateLobbyActivity(lobbyCode);
                setTimerForLobby(lobbyCode, lobbyData);
                broadcastState(lobbyCode, rolesSwapped);
                break;
            }

            case 'draftHover': {
                if (!lobbyData) return;
                const { id: hoveredId } = payload;
                const { draft } = lobbyData;
                const { currentPlayer } = draft;
                if (ws.userRole !== currentPlayer && ws.userRole !== 'ref') return;

                // Validate hovered ID belongs to the correct pool for ID phases
                if (['ban', 'pick', 'midBan', 'pick2', 'pick_s2'].includes(draft.phase)) {
                    const isBanAction = (draft.phase === 'ban' || draft.phase === 'midBan');
                    
                    if (isBanAction) {
                        // For ban actions: validate against enemy roster
                        const enemyPlayer = currentPlayer === 'p1' ? 'p2' : 'p1';
                        const enemyRoster = lobbyData.roster[enemyPlayer] || [];
                        const blocked = new Set([
                            ...draft.idBans.p1,
                            ...draft.idBans.p2,
                            ...draft.picks[enemyPlayer],
                            ...draft.picks_s2[enemyPlayer]
                        ]);
                        const availableFromEnemy = enemyRoster.filter(id => !blocked.has(id));
                        if (!availableFromEnemy.includes(hoveredId)) return;
                    } else {
                        // For pick actions: validate against own available roster
                        const sourceList = draft.available[currentPlayer] || [];
                        if (!sourceList.includes(hoveredId)) return;
                    }
                }

                draft.hovered[currentPlayer] = (draft.hovered[currentPlayer] === hoveredId) ? null : hoveredId;
                updateLobbyActivity(lobbyCode);
                broadcastState(lobbyCode);
                break;
            }

            case 'draftConfirm': {
                if (!lobbyData) return;
                handleDraftConfirm(lobbyCode, lobbyData, ws);
                // Any confirmation (ban or pick) can change future bannable pools.
                computeBanPools(lobbyData);
                break;
            }

            case 'draftControl': {
                if (!validateRefereeAccess(ws, lobbyData)) return;

                if (action === 'confirmEgoBans') {
                     const { currentPlayer } = lobbyData.draft;
                     if (lobbyData.draft.egoBans[currentPlayer].length === EGO_BAN_COUNT) {
                        lobbyData = advancePhase(lobbyData);
                     }
                } else if (action === 'complete') {
                    lobbyData.draft.phase = "complete";
                }
                
                updateLobbyActivity(lobbyCode);
                setTimerForLobby(lobbyCode, lobbyData);
                broadcastState(lobbyCode);
                break;
            }

            case 'timerControl': {
                if (!validateRefereeAccess(ws, lobbyData)) return;
                const { timer } = lobbyData.draft;
                
                if (timer.paused) { // unpausing
                    timer.paused = false;
                    timer.running = true;
                    timer.endTime = Date.now() + timer.pauseTime;
                    
                    const timeoutId = setTimeout(() => handleTimer(lobbyCode), timer.pauseTime);
                    lobbyTimers[lobbyCode] = { timeoutId };

                } else { // pausing
                    if (lobbyTimers[lobbyCode]) clearTimeout(lobbyTimers[lobbyCode].timeoutId);
                    timer.paused = true;
                    timer.running = false;
                    timer.pauseTime = Math.max(0, timer.endTime - Date.now());
                }
                updateLobbyActivity(lobbyCode);
                broadcastState(lobbyCode);
                break;
            }

            case 'keepAlive': {
                // Keep-alive message to prevent Render sleep during active drafts
                if (!lobbyData) return;
                updateLobbyActivity(lobbyCode);
                // Send a minimal acknowledgment to confirm server is active
                ws.send(JSON.stringify({ type: 'keepAliveAck' }));
                break;
            }
        }
    });

    ws.on('close', () => {
        logInfo('CONNECTION', 'Client disconnected', { remoteAddress: ws.remoteAddress, lobbyCode: ws.lobbyCode, userRole: ws.userRole });
        const { lobbyCode, userRole } = ws;
        if (lobbyCode && userRole && lobbies[lobbyCode]) {
            const lobbyData = lobbies[lobbyCode];
            const currentRole = Object.keys(lobbyData.participants).find(
                r => lobbyData.participants[r].rejoinToken === ws.rejoinToken
            ) || userRole;
            
            if (lobbyData.participants[currentRole]) {
                lobbyData.participants[currentRole].status = 'disconnected';
                lobbyData.participants[currentRole].ready = false;
                updateLobbyActivity(lobbyCode);
                broadcastState(lobbyCode);
            }
        }
    });
});

const LOBBY_TTL = 2 * 60 * 60 * 1000; // 2 hours

function cleanupInactiveLobbies() {
    const now = new Date();
    for (const lobbyCode in lobbies) {
        const lastActivity = new Date(lobbies[lobbyCode].lastActivity);
        if (now - lastActivity > LOBBY_TTL) {
            logInfo('CLEANUP', 'Cleaning up inactive lobby', { lobbyCode, lastActivity: lastActivity.toISOString(), hoursInactive: Math.round((now - lastActivity) / (1000 * 60 * 60) * 10) / 10 });
            if (lobbyTimers[lobbyCode] && lobbyTimers[lobbyCode].timeoutId) {
                clearTimeout(lobbyTimers[lobbyCode].timeoutId);
                delete lobbyTimers[lobbyCode];
            }
            delete lobbies[lobbyCode];
        }
    }
}

setInterval(cleanupInactiveLobbies, 30 * 60 * 1000);


const PORT = process.env.PORT || 8080;
server.listen(PORT, () => logInfo('SERVER', `Server started and listening on port ${PORT}`));
