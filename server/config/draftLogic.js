// server/config/draftLogic.js
// Draft sequence configurations and timer defaults

const TIMERS = {
    roster: 90,
    egoBan: 20, // 20 seconds for each EGO ban
    pick: 15,
};

// --- DRAFT LOGIC SEQUENCES ---
const DRAFT_LOGIC = {
    '1-2-2': {
        egoBanSteps: 10,
        ban1Steps: 8,
        pick1: [{ p: 'p1', c: 1 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 1 }],
        midBanSteps: 6,
        // Phase 2 (pick2) starts with p2 - the player who goes second during phase 1 goes first during phase 2
        pick2: [{ p: 'p2', c: 1 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 1 }],
        pick_s2: [{ p: 'p1', c: 1 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 1 }]
    },
    '1-2-2-extended': { // For "All Sections" matches
        egoBanSteps: 10,
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
        egoBanSteps: 10,
        ban1Steps: 8,
        pick1: [{ p: 'p1', c: 2 }, { p: 'p2', c: 3 }, { p: 'p1', c: 2 }, { p: 'p2', c: 3 }, { p: 'p1', c: 2 }],
        midBanSteps: 6,
        pick2: [{ p: 'p2', c: 2 }, { p: 'p1', c: 3 }, { p: 'p2', c: 2 }, { p: 'p1', c: 3 }, { p: 'p2', c: 2 }],
        pick_s2: [{ p: 'p1', c: 1 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 1 }]
    },
    '2-3-2-extended': { // For "All Sections" matches
        egoBanSteps: 10,
        ban1Steps: 8,
        pick1: [{ p: 'p1', c: 2 }, { p: 'p2', c: 3 }, { p: 'p1', c: 2 }, { p: 'p2', c: 3 }, { p: 'p1', c: 2 }],
        midBanSteps: 8, // Increased to 8
        pick2: [ // Starts with p2 now - the player who goes second during phase 1 goes first during phase 2
            { p: 'p2', c: 1 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 },
            { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 },
            { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 },
            { p: 'p2', c: 1 }
        ],
    },
    '2-3-2-less-bans': {
        egoBanSteps: 6,
        ban1Steps: 6,
        pick1: [{ p: 'p1', c: 2 }, { p: 'p2', c: 3 }, { p: 'p1', c: 2 }, { p: 'p2', c: 3 }, { p: 'p1', c: 2 }],
        midBanSteps: 6,
        pick2: [{ p: 'p2', c: 2 }, { p: 'p1', c: 3 }, { p: 'p2', c: 2 }, { p: 'p1', c: 3 }, { p: 'p2', c: 2 }],
        pick_s2: [{ p: 'p1', c: 1 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 2 }, { p: 'p2', c: 2 }, { p: 'p1', c: 1 }]
    },
    '2-3-2-less-bans-extended': { // For "All Sections" matches
        egoBanSteps: 6,
        ban1Steps: 6,
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

module.exports = { TIMERS, DRAFT_LOGIC };
