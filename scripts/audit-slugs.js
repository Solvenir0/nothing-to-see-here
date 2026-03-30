#!/usr/bin/env node
// scripts/audit-slugs.js
// Verifies that every ID has a matching image in uploads/identity/,
// every EGO has a matching image in uploads/ego/,
// and flags any orphaned image files.
// Run from project root: node scripts/audit-slugs.js

const fs = require('fs');
const path = require('path');

// ─── Load the shared slug helper and identity/ego data from JSON ─────────────
const { allIds, createSlug } = require('../server/utils/idData');
const identities = require('../data/identities.json');
const egos       = require('../data/egos.json');

// Compute ego slugs the same way parseEGOData does in the client
function egoSlug(entry) {
    return createSlug(`${entry.name}-${entry.sinner}`);
}

// ─── Load uploads/identity/ directory ────────────────────────────────────────
const identityDir = path.join(__dirname, '../uploads/identity');
const identityFiles = new Set(
    fs.readdirSync(identityDir)
        .filter(f => f.endsWith('.webp'))
        .map(f => f.replace(/\.webp$/, ''))
);

// ─── Load uploads/ego/ directory ─────────────────────────────────────────────
const egoDir = path.join(__dirname, '../uploads/ego');
const egoFiles = new Set(
    fs.readdirSync(egoDir)
        .filter(f => f.endsWith('.webp'))
        .map(f => f.replace(/\.webp$/, ''))
);

// ─── Known non-ID images (excluded from "orphaned" report) ───────────────────
const EXCLUDED_IDENTITY = new Set([
    'cropped-limbus_logo_feather',
    'lcb-sinner-don-quixote',
    'lcb-sinner-faust',
    'lcb-sinner-gregor',
    'lcb-sinner-heathcliff',
    'lcb-sinner-hong-lu',
    'lcb-sinner-ishmael',
    'lcb-sinner-meursault',
    'lcb-sinner-outis',
    'lcb-sinner-rodion',
    'lcb-sinner-ryshu',
    'lcb-sinner-sinclair',
    'lcb-sinner-yi-sang',
]);

// ─── Audit identities ─────────────────────────────────────────────────────────
const idMissing  = [];
const idOrphaned = [];
const idOk       = [];
const seenIdSlugs = new Set();

for (const entry of identities) {
    const slug = createSlug(entry.name);
    if (!slug) { idMissing.push({ name: entry.name, slug, reason: 'createSlug returned empty string' }); continue; }
    if (seenIdSlugs.has(slug)) { idMissing.push({ name: entry.name, slug, reason: 'COLLISION — duplicate slug' }); continue; }
    seenIdSlugs.add(slug);
    if (identityFiles.has(slug)) {
        idOk.push({ name: entry.name, slug });
    } else {
        idMissing.push({ name: entry.name, slug, reason: 'no matching .webp in uploads/identity/' });
    }
}

for (const file of identityFiles) {
    if (!EXCLUDED_IDENTITY.has(file) && !seenIdSlugs.has(file)) {
        idOrphaned.push(file);
    }
}

// ─── Audit EGOs ──────────────────────────────────────────────────────────────
const egoMissing  = [];
const egoOrphaned = [];
const egoOk       = [];
const seenEgoSlugs = new Set();

for (const entry of egos) {
    const slug = egoSlug(entry);
    if (!slug) { egoMissing.push({ name: `${entry.name} (${entry.sinner})`, slug, reason: 'createSlug returned empty string' }); continue; }
    if (seenEgoSlugs.has(slug)) { egoMissing.push({ name: `${entry.name} (${entry.sinner})`, slug, reason: 'COLLISION — duplicate slug' }); continue; }
    seenEgoSlugs.add(slug);
    if (egoFiles.has(slug)) {
        egoOk.push({ name: `${entry.name} (${entry.sinner})`, slug });
    } else {
        egoMissing.push({ name: `${entry.name} (${entry.sinner})`, slug, reason: 'no matching .webp in uploads/ego/' });
    }
}

for (const file of egoFiles) {
    if (!seenEgoSlugs.has(file)) egoOrphaned.push(file);
}

// ─── Report ──────────────────────────────────────────────────────────────────
const W = 72;
const HR = '─'.repeat(W);
const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED    = '\x1b[31m';
const RESET  = '\x1b[0m';

console.log(`\n${HR}`);
console.log(' LIMBUS DRAFT HUB — SLUG AUDIT REPORT');
console.log(HR);
console.log(` Identities in JSON : ${identities.length}`);
console.log(` EGOs in JSON       : ${egos.length}`);
console.log(` Identity images    : ${identityFiles.size} (${EXCLUDED_IDENTITY.size} excluded)`);
console.log(` EGO images         : ${egoFiles.size}`);
console.log(HR);

// ── Identity results ──────────────────────────────────────────────────────────
console.log('\n IDENTITIES (uploads/identity/)');
if (idMissing.length === 0 && idOrphaned.length === 0) {
    console.log(`${GREEN} ✓ All ${idOk.length} identities have matching image files. No orphans.${RESET}`);
} else {
    if (idMissing.length > 0) {
        console.log(`\n${RED} MISSING images (${idMissing.length})${RESET}`);
        for (const { name, slug, reason } of idMissing) {
            console.log(`  ${RED}✗${RESET} ${name}`);
            console.log(`      slug   : ${slug || '(empty)'}`);
            console.log(`      reason : ${reason}`);
        }
    }
    if (idOrphaned.length > 0) {
        console.log(`\n${YELLOW} ORPHANED identity images (${idOrphaned.length})${RESET}`);
        for (const file of idOrphaned.sort()) console.log(`  ${YELLOW}?${RESET} ${file}.webp`);
    }
}

// ── EGO results ───────────────────────────────────────────────────────────────
console.log('\n EGOS (uploads/ego/)');
if (egoMissing.length === 0 && egoOrphaned.length === 0 && egoFiles.size === 0) {
    console.log(`${YELLOW} No EGO images yet — drop .webp files into uploads/ego/ to add them.${RESET}`);
} else if (egoMissing.length === 0 && egoOrphaned.length === 0) {
    console.log(`${GREEN} ✓ All ${egoOk.length} EGOs have matching image files. No orphans.${RESET}`);
} else {
    if (egoMissing.length > 0) {
        console.log(`\n${RED} MISSING EGO images (${egoMissing.length})${RESET}`);
        for (const { name, slug, reason } of egoMissing) {
            console.log(`  ${RED}✗${RESET} ${name}`);
            console.log(`      slug   : ${slug || '(empty)'}`);
            console.log(`      reason : ${reason}`);
        }
    }
    if (egoOrphaned.length > 0) {
        console.log(`\n${YELLOW} ORPHANED EGO images (${egoOrphaned.length})${RESET}`);
        for (const file of egoOrphaned.sort()) console.log(`  ${YELLOW}?${RESET} ${file}.webp`);
    }
}

console.log(`\n${HR}`);
console.log(` IDs:  ${GREEN}${idOk.length} OK${RESET}, ${RED}${idMissing.length} MISSING${RESET}, ${YELLOW}${idOrphaned.length} ORPHANED${RESET}`);
console.log(` EGOs: ${GREEN}${egoOk.length} OK${RESET}, ${RED}${egoMissing.length} MISSING${RESET}, ${YELLOW}${egoOrphaned.length} ORPHANED${RESET}`);
console.log(`${HR}\n`);

const hasErrors = idMissing.some(m => !m.reason.startsWith('no matching')) || egoMissing.some(m => !m.reason.startsWith('no matching'));
process.exit(hasErrors ? 1 : 0);

