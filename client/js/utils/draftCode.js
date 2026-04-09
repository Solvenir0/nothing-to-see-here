// client/js/utils/draftCode.js
// Encode/decode draft templates to/from shareable base64 codes.
// Format v2: btoa(JSON.stringify({ v:2, rs, steps:[[playerIdx, typeIdx, count], ...] }))
// Format v3: adds optional bans:['slug',...] field for banned IDs
// Format v4: adds optional timer:{ en, eb, ib, ip, rv } for timer settings
//   en = enabled (0|1), eb = egoBanTime, ib = idBanTime, ip = idPickTime, rv = reserveTime
// playerIdx: 1=p1, 2=p2  |  typeIdx: 1=egoBan, 2=idBan, 3=idPick

const TYPE_ENC = { egoBan: 1, idBan: 2, idPick: 3 };
const TYPE_DEC = { 1: 'egoBan', 2: 'idBan', 3: 'idPick' };

export function encodeDraftTemplate(template) {
    try {
        if (!template || !Array.isArray(template.steps) || template.steps.length === 0) return null;
        const bannedIds = template.bannedIds || [];
        const ts = template.timerSettings;
        const hasTimer = template.timerEnabled || (ts && (ts.egoBanTime || ts.idBanTime || ts.idPickTime || ts.reserveTime));

        let v = 2;
        if (bannedIds.length > 0) v = 3;
        if (hasTimer) v = 4;

        const compact = {
            v,
            rs: template.rosterSize,
            steps: template.steps.map(s => [s.p === 'p1' ? 1 : 2, TYPE_ENC[s.type], s.c]),
            ...(bannedIds.length > 0 ? { bans: bannedIds } : {}),
            ...(hasTimer ? {
                timer: {
                    en: template.timerEnabled ? 1 : 0,
                    eb: ts?.egoBanTime  ?? 20,
                    ib: ts?.idBanTime   ?? 30,
                    ip: ts?.idPickTime  ?? 30,
                    rv: ts?.reserveTime ?? 120,
                }
            } : {}),
        };
        return btoa(JSON.stringify(compact));
    } catch (e) {
        console.error('Error encoding draft template:', e);
        return null;
    }
}

export function decodeDraftTemplate(code) {
    try {
        const compact = JSON.parse(atob(code.replace(/\s+/g, '')));
        if (compact.v !== 2 && compact.v !== 3 && compact.v !== 4) return null;

        const template = {
            rosterSize: compact.rs,
            bannedIds: Array.isArray(compact.bans) ? compact.bans : [],
            steps: compact.steps.map(s => ({
                p:    s[0] === 1 ? 'p1' : 'p2',
                type: TYPE_DEC[s[1]] || null,
                c:    s[2],
            })),
            timerEnabled: compact.timer ? compact.timer.en === 1 : false,
            timerSettings: compact.timer ? {
                egoBanTime:  compact.timer.eb ?? 20,
                idBanTime:   compact.timer.ib ?? 30,
                idPickTime:  compact.timer.ip ?? 30,
                reserveTime: compact.timer.rv ?? 120,
            } : {
                egoBanTime: 20,
                idBanTime: 30,
                idPickTime: 30,
                reserveTime: 120,
            },
        };

        return validateDecodedTemplate(template) ? template : null;
    } catch (e) {
        console.error('Error decoding draft template:', e);
        return null;
    }
}

function validateDecodedTemplate(t) {
    const VALID_TYPES = new Set(['egoBan', 'idBan', 'idPick']);
    const VALID_P     = new Set(['p1', 'p2']);
    const isStep = s => s && VALID_P.has(s.p) && VALID_TYPES.has(s.type) &&
        Number.isInteger(s.c) && s.c >= 1 && s.c <= 99;
    const bansOk = Array.isArray(t.bannedIds) && t.bannedIds.every(b => typeof b === 'string' && b.length <= 120);
    const ts = t.timerSettings;
    const timerOk = ts &&
        Number.isInteger(ts.egoBanTime)  && ts.egoBanTime  >= 5 && ts.egoBanTime  <= 600 &&
        Number.isInteger(ts.idBanTime)   && ts.idBanTime   >= 5 && ts.idBanTime   <= 600 &&
        Number.isInteger(ts.idPickTime)  && ts.idPickTime  >= 5 && ts.idPickTime  <= 600 &&
        Number.isInteger(ts.reserveTime) && ts.reserveTime >= 0 && ts.reserveTime <= 3600;
    return Number.isInteger(t.rosterSize) && t.rosterSize >= 1 && t.rosterSize <= 200 &&
        Array.isArray(t.steps) && t.steps.length >= 1 && t.steps.every(isStep) && bansOk && timerOk;
}
