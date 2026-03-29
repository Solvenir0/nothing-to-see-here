// server/store.js
// Shared in-memory state — required as a singleton by all server modules.
// Node's module cache ensures every require() gets the same object references.

const lobbies = {};
const lobbyTimers = {};
const VALID_ROLES = new Set(['p1', 'p2', 'ref']);

module.exports = { lobbies, lobbyTimers, VALID_ROLES };
