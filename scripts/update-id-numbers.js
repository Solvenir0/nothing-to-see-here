// scripts/update-id-numbers.js
// Generates or updates data/id-numbers.json — a stable per-sinner ordered list of ID slugs.
//
// USAGE: node scripts/update-id-numbers.js
// Run this after adding any new identities to data/identities.json.
//
// RULES:
// - Slugs within each sinner's array are NEVER reordered or removed.
// - New slugs are appended to the END of that sinner's array.
// - Each sinner slot holds up to 40 IDs (indices 0–39).
// - Encoding: value = sinnerIndex * 40 + withinSinnerIndex (max 479, fits in Uint16)

const fs   = require('fs');
const path = require('path');

const SINNER_ORDER = [
    "Yi Sang", "Faust", "Don Quixote", "Ryōshū", "Meursault",
    "Hong Lu", "Heathcliff", "Ishmael", "Rodion", "Sinclair", "Outis", "Gregor"
];
const SLOTS_PER_SINNER = 40;

const identitiesPath  = path.join(__dirname, '../data/identities.json');
const idNumbersPath   = path.join(__dirname, '../data/id-numbers.json');

// Load existing table or start fresh
let table = {};
if (fs.existsSync(idNumbersPath)) {
    table = JSON.parse(fs.readFileSync(idNumbersPath, 'utf8'));
}
// Ensure every sinner has an array
SINNER_ORDER.forEach(s => { if (!table[s]) table[s] = []; });

// Build slug from name (must match client createSlug logic)
function createSlug(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-');
}

const identities = JSON.parse(fs.readFileSync(identitiesPath, 'utf8'));

let added = 0;
identities.forEach(entry => {
    const sinnerMatch = entry.name.match(
        /(Yi Sang|Faust|Don Quixote|Ryōshū|Meursault|Hong Lu|Heathcliff|Ishmael|Rodion|Sinclair|Outis|Gregor)$/
    );
    if (!sinnerMatch) {
        console.warn(`  WARN: Could not determine sinner for "${entry.name}" — skipped`);
        return;
    }
    const sinner = sinnerMatch[1];
    const slug   = createSlug(entry.name);

    if (!table[sinner].includes(slug)) {
        if (table[sinner].length >= SLOTS_PER_SINNER) {
            console.error(`  ERROR: ${sinner} already has ${SLOTS_PER_SINNER} slots — increase SLOTS_PER_SINNER`);
            process.exit(1);
        }
        table[sinner].push(slug);
        added++;
        console.log(`  + ${sinner}[${table[sinner].length - 1}] = ${slug}`);
    }
});

// Validate no sinner exceeds the limit
SINNER_ORDER.forEach(s => {
    if (table[s].length > SLOTS_PER_SINNER) {
        console.error(`ERROR: ${s} has ${table[s].length} entries, exceeds limit of ${SLOTS_PER_SINNER}`);
        process.exit(1);
    }
});

fs.writeFileSync(idNumbersPath, JSON.stringify(table, null, 2));

const total = SINNER_ORDER.reduce((sum, s) => sum + table[s].length, 0);
console.log(`\nDone. ${added} new slug(s) added. Total: ${total} IDs across ${SINNER_ORDER.length} sinners.`);
console.log(`Max encodable value: ${(SINNER_ORDER.length - 1) * SLOTS_PER_SINNER + (SLOTS_PER_SINNER - 1)} (fits in Uint16)`);
