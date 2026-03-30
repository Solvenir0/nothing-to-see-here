// server/utils/idData.js
// ID catalog: slugs used server-side to validate rosters and picks.
// Source of truth is data/identities.json — edit that file to add/remove IDs.

const path = require('path');

function createSlug(name) {
    if (!name) return '';
    return name.toLowerCase()
        .replace(/ryōshū/g, 'ryshu').replace(/öufi/g, 'ufi')
        .replace(/e\.g\.o::/g, 'ego-')
        .replace(/ & /g, ' ').replace(/[.'"]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/[^\w-]+/g, '');
}

const identities = require(path.join(__dirname, '../../data/identities.json'));
const allIds = Object.freeze(identities.map(entry => createSlug(entry.name)));

module.exports = { allIds, createSlug };
