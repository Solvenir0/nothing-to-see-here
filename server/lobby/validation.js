// server/lobby/validation.js
// Input validation helpers and access control guards for WebSocket handlers.

const { allIds } = require('../utils/idData');
const { VALID_ROLES } = require('../store');

// Send a standardised error response over WebSocket
function sendError(ws, message) {
    ws.send(JSON.stringify({ type: 'error', message }));
}

// Referee can act for anyone; a player can only act for themselves
function isAuthorized(ws, targetRole) {
    return ws && (ws.userRole === 'ref' || ws.userRole === targetRole);
}

function validateRoster(roster, rosterSize) {
    if (!Array.isArray(roster)) return false;
    const sizeOk = roster.length === rosterSize;
    const uniqueOk = new Set(roster).size === roster.length;
    const idsOk = roster.every(x => allIds.includes(x));
    return sizeOk && uniqueOk && idsOk;
}

function validateLobbyExists(ws, lobbyData, sendErrorOnFail = false) {
    if (!lobbyData) {
        if (sendErrorOnFail && ws) {
            sendError(ws, 'Lobby not found.');
        }
        return false;
    }
    return true;
}

function validatePlayerRole(player) {
    return VALID_ROLES.has(player) && player !== 'ref';
}

function validatePlayerAccess(ws, player, lobbyData) {
    return validateLobbyExists(null, lobbyData) &&
           validatePlayerRole(player) &&
           isAuthorized(ws, player);
}

function validatePlayerNotReady(lobbyData, player) {
    return lobbyData.participants[player] && !lobbyData.participants[player].ready;
}

function validateRefereeAccess(ws, lobbyData) {
    return validateLobbyExists(null, lobbyData) && ws.userRole === 'ref';
}

module.exports = {
    sendError,
    isAuthorized,
    validateRoster,
    validateLobbyExists,
    validatePlayerRole,
    validatePlayerAccess,
    validatePlayerNotReady,
    validateRefereeAccess,
};
