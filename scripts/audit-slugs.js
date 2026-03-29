#!/usr/bin/env node
// scripts/audit-slugs.js
// Verifies that every ID in the CSV has a matching image in uploads/,
// and flags any image files in uploads/ that have no matching ID.
// Run from project root: node scripts/audit-slugs.js

const fs = require('fs');
const path = require('path');

// ─── Load the shared data from the server module ────────────────────────────
const { allIds, createSlug } = require('../server/utils/idData');

// Also re-read the raw CSV names so we can report human-readable names.
// We duplicate the minimal parsing here to stay self-contained.
const idDataSrc = fs.readFileSync(path.join(__dirname, '../server/utils/idData.js'), 'utf8');
const csvMatch  = idDataSrc.match(/const idCsvData\s*=\s*`([\s\S]*?)`;/);
if (!csvMatch) {
    console.error('ERROR: Could not extract idCsvData from server/utils/idData.js');
    process.exit(1);
}
const rawCsv = csvMatch[1].trim();

function parseNames(csv) {
    const lines = csv.split('\n').filter(l => l.trim());
    // skip header
    return lines.slice(1).map(line => {
        const m = line.match(/^"([^"]+)"/);
        return m ? m[1] : null;
    }).filter(Boolean);
}

const names = parseNames(rawCsv);

// ─── Load uploads/ directory ─────────────────────────────────────────────────
const uploadsDir = path.join(__dirname, '../uploads');
const uploadFiles = new Set(
    fs.readdirSync(uploadsDir)
        .filter(f => f.endsWith('.webp'))
        .map(f => f.replace(/\.webp$/, ''))       // strip extension for comparison
);

// ─── Known non-ID images (excluded from "orphaned" report) ───────────────────
// Add any additional non-ID uploads here.
const EXCLUDED = new Set([
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

// ─── Audit ────────────────────────────────────────────────────────────────────
const missing   = [];   // IDs with no image file
const orphaned  = [];   // image files with no matching ID
const ok        = [];   // everything matched

const seenSlugs = new Set();

for (const name of names) {
    const slug = createSlug(name);

    if (!slug) {
        missing.push({ name, slug, reason: 'createSlug returned empty string' });
        continue;
    }

    if (seenSlugs.has(slug)) {
        missing.push({ name, slug, reason: 'COLLISION — duplicate slug' });
        continue;
    }
    seenSlugs.add(slug);

    if (uploadFiles.has(slug)) {
        ok.push({ name, slug });
    } else {
        missing.push({ name, slug, reason: 'no matching .webp in uploads/' });
    }
}

// Find orphaned files (in uploads/ but not matched by any ID and not excluded)
for (const file of uploadFiles) {
    if (!EXCLUDED.has(file) && !seenSlugs.has(file)) {
        orphaned.push(file);
    }
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
console.log(` IDs in CSV   : ${names.length}`);
console.log(` Images found : ${uploadFiles.size - EXCLUDED.size} (${EXCLUDED.size} excluded)`);
console.log(HR);

if (missing.length === 0 && orphaned.length === 0) {
    console.log(`${GREEN} ✓ All ${ok.length} IDs have matching image files. No orphans.${RESET}`);
} else {
    if (missing.length > 0) {
        console.log(`\n${RED} MISSING images (${missing.length})${RESET}`);
        for (const { name, slug, reason } of missing) {
            console.log(`  ${RED}✗${RESET} ${name}`);
            console.log(`      slug   : ${slug || '(empty)'}`);
            console.log(`      reason : ${reason}`);
        }
    }

    if (orphaned.length > 0) {
        console.log(`\n${YELLOW} ORPHANED images (${orphaned.length}) — no matching ID in CSV${RESET}`);
        for (const file of orphaned.sort()) {
            console.log(`  ${YELLOW}?${RESET} ${file}.webp`);
        }
    }

    if (ok.length > 0) {
        console.log(`\n${GREEN} OK (${ok.length})${RESET}`);
        for (const { slug } of ok) {
            console.log(`  ${GREEN}✓${RESET} ${slug}`);
        }
    }
}

console.log(`\n${HR}`);
console.log(` Summary: ${GREEN}${ok.length} OK${RESET}, ${RED}${missing.length} MISSING${RESET}, ${YELLOW}${orphaned.length} ORPHANED${RESET}`);
console.log(`${HR}\n`);

process.exit(missing.length > 0 ? 1 : 0);
