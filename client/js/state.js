// client/js/state.js
// Mutable application state singleton and DOM element cache.
// generateUserId is here because it solely initialises state.userId;
// it will move to client/js/utils/core.js in Step 6.

import { GAME_CONFIG, loadKoreanModeFromStorage } from './config.js';

function generateUserId() {
    return 'user-' + Math.random().toString(36).substr(GAME_CONFIG.USER_ID_START_POS, GAME_CONFIG.USER_ID_LENGTH);
}

export const state = {
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
    idSlotMap: {},   // slug → Uint16 value (sinnerIndex * 40 + withinSinnerIndex)
    slotToId: {},    // Uint16 value → slug
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
    koreanMode: loadKoreanModeFromStorage(),
    timerInterval: null,
    keepAliveInterval: null,
    lastCountdownSecond: null,
    socket: null,
    joinTarget: {
        lobbyCode: null,
        role: null,
    },
    draftMakerState: {
        rosterSize: 42,
        bannedIds: [],
        timerEnabled: false,
        timerSettings: {
            egoBanTime: 20,
            idBanTime: 30,
            idPickTime: 30,
            reserveTime: 120,
        },
        steps: [
            // EGO bans (10 alternating, p1 starts)
            {p:'p1',type:'egoBan',c:1},{p:'p2',type:'egoBan',c:1},{p:'p1',type:'egoBan',c:1},{p:'p2',type:'egoBan',c:1},{p:'p1',type:'egoBan',c:1},
            {p:'p2',type:'egoBan',c:1},{p:'p1',type:'egoBan',c:1},{p:'p2',type:'egoBan',c:1},{p:'p1',type:'egoBan',c:1},{p:'p2',type:'egoBan',c:1},
            // ID bans phase 1 (8 alternating, p1 starts)
            {p:'p1',type:'idBan',c:1},{p:'p2',type:'idBan',c:1},{p:'p1',type:'idBan',c:1},{p:'p2',type:'idBan',c:1},
            {p:'p1',type:'idBan',c:1},{p:'p2',type:'idBan',c:1},{p:'p1',type:'idBan',c:1},{p:'p2',type:'idBan',c:1},
            // Pick phase 1 (2-3-2)
            {p:'p1',type:'idPick',c:2},{p:'p2',type:'idPick',c:3},{p:'p1',type:'idPick',c:2},{p:'p2',type:'idPick',c:3},{p:'p1',type:'idPick',c:2},
            // Mid bans (6 alternating, p2 starts)
            {p:'p2',type:'idBan',c:1},{p:'p1',type:'idBan',c:1},{p:'p2',type:'idBan',c:1},{p:'p1',type:'idBan',c:1},{p:'p2',type:'idBan',c:1},{p:'p1',type:'idBan',c:1},
            // Pick phase 2
            {p:'p2',type:'idPick',c:2},{p:'p1',type:'idPick',c:3},{p:'p2',type:'idPick',c:2},{p:'p1',type:'idPick',c:3},{p:'p2',type:'idPick',c:2},
        ],
    }
};

// Populated by cacheDOMElements() in main.js
export let elements = {};
