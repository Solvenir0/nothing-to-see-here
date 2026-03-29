// client/js/config.js
// Static constants and client-side settings.
// Imported by state.js and most other modules.

export const SINNER_ORDER = [
    "Yi Sang", "Faust", "Don Quixote", "Ryōshū", "Meursault",
    "Hong Lu", "Heathcliff", "Ishmael", "Rodion", "Sinclair", "Outis", "Gregor"
];

export const zayinBanExceptions = [
    "Bygone Days (Yi Sang)",
    "Soda (Ryōshū)",
    "Holiday (Heathcliff)",
    "Hundred-Footed Death Maggot [蝍蛆殺] (Ishmael)",
    "Cavernous Wailing (Sinclair)",
    "Legerdemain (Gregor)"
];

// Timing constants (in milliseconds)
export const TIMING = {
    NOTIFICATION_HIDE_DELAY: 3000,
    CONNECTION_ERROR_DELAY: 5000,
    RECONNECT_ATTEMPT_DELAY: 10000,
    WEBSOCKET_RETRY_DELAY: 100,
    TOOLTIP_SHOW_DELAY: 500,
    TIMER_UPDATE_INTERVAL: 1000,
    KEEP_ALIVE_INTERVAL: 4 * 60 * 1000  // 4 minutes
};

// Game configuration constants
export const GAME_CONFIG = {
    DEFAULT_RESERVE_TIME: 120,  // seconds
    SECTION1_ROSTER_SIZE: 42,
    ALL_SECTIONS_ROSTER_SIZE: 72,
    USER_ID_LENGTH: 9,
    USER_ID_START_POS: 2,
    MAX_GENERATION_ATTEMPTS: 1000
};

export function loadKoreanModeFromStorage() {
    try {
        const saved = localStorage.getItem('limbusKoreanMode');
        return saved === 'true';
    } catch (e) {
        return false;
    }
}

export function saveKoreanModeToStorage(enabled) {
    try {
        localStorage.setItem('limbusKoreanMode', enabled.toString());
    } catch (e) {
        console.warn('Could not save Korean mode preference:', e);
    }
}
