#!/usr/bin/env node
// scripts/list-slugs.js
// Prints the expected image filename (slug) for every identity and EGO entry.
// Use this to know exactly what to name your .webp files before dropping them
// into uploads/identity/ or uploads/ego/.
//
// Run from project root:
//   node scripts/list-slugs.js           — prints both lists
//   node scripts/list-slugs.js id        — identities only
//   node scripts/list-slugs.js ego       — EGOs only
//   node scripts/list-slugs.js ego Faust — EGOs filtered by sinner

const { createSlug } = require('../server/utils/idData');
const identities = require('../data/identities.json');
const egos       = require('../data/egos.json');

const filter = process.argv[2]?.toLowerCase();  // 'id', 'ego', or undefined
const sinnerFilter = process.argv[3];            // e.g. 'Faust'

const W   = 72;
const HR  = '─'.repeat(W);
const DIM = '\x1b[2m';
const RST = '\x1b[0m';
const CYN = '\x1b[36m';
const YLW = '\x1b[33m';

if (!filter || filter === 'id') {
    console.log(`\n${HR}`);
    console.log(` IDENTITIES — uploads/identity/<slug>.webp`);
    console.log(HR);
    let list = identities;
    if (sinnerFilter) list = list.filter(e => e.name.toLowerCase().includes(sinnerFilter.toLowerCase()));
    list.forEach(entry => {
        const slug = createSlug(entry.name);
        console.log(`${CYN}${slug}.webp${RST}  ${DIM}← ${entry.name}${RST}`);
    });
    console.log(`${DIM} ${list.length} identities${RST}`);
}

if (!filter || filter === 'ego') {
    console.log(`\n${HR}`);
    console.log(` EGOS — uploads/ego/<slug>.webp`);
    console.log(HR);
    let list = egos;
    if (sinnerFilter) list = list.filter(e => e.sinner.toLowerCase() === sinnerFilter.toLowerCase());
    list.forEach(entry => {
        const slug = createSlug(`${entry.name}-${entry.sinner}`);
        console.log(`${YLW}${slug}.webp${RST}  ${DIM}← ${entry.name} (${entry.sinner}) [${entry.rarity}]${RST}`);
    });
    console.log(`${DIM} ${list.length} EGOs${RST}`);
}

console.log(`\n${HR}\n`);
