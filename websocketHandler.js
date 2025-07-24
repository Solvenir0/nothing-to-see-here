// =================================================================================
// FILE: websocketHandler.js
// DESCRIPTION: Main router for all incoming WebSocket messages. It validates
//              and delegates actions to the appropriate modules (lobbyManager, draftLogic).
// =================================================================================
const Joi = require('joi');
const lobbyManager = require('./lobbyManager');
const draftLogic = require('./draftLogic');
const { allIds } = require('./server_data').initializeData();
const config = require('./config');

// --- Input Validation Schemas ---
const schemas = {
    createLobby: Joi.object({
        name: Joi.string().trim().min(1).max(30).required(),
        draftLogic: Joi.string().valid('1-2-2', '2-3-2').required(),
        matchType: Joi.string().valid('section1', 'allSections').required(),
        timerEnabled: Joi.boolean().required(),
        isPublic: Joi.boolean().required(),
    }),
    joinLobby: Joi.object({
        lobbyCode: Joi.string().trim().length(6).required(),
        role: Joi.string().valid('p1', 'p2', 'ref').required(),
        name: Joi.string().trim().min(1).max(30).optional(),
    }),
    rosterSet: Joi.object({
        lobbyCode: Joi.string().trim().length(6).required(),
        player: Joi.string().valid('p1', 'p2').required(),
        roster: Joi.array().length(config.ROSTER_SIZE).items(Joi.string().valid(...allIds)).required()
    }),
    // Add more schemas for other actions as needed...
};

// --- Message Handling Logic ---

function sendError(ws, message) {
    ws.send(JSON.stringify({ type: 'error', payload: { message } }));
}

function handleWebSocketMessage(ws, message, wss) {
    const { type, payload } = message;
    const { lobbyCode } = payload || {};
    
    // Get lobby for most operations
    const lobby = lobbyCode ? lobbyManager.getLobby(lobbyCode.toUpperCase()) : null;

    // Attach user role from ws object for validation if available
    const actingPlayer = ws.userRole;

    switch (type) {
        case 'createLobby': {
            const { error, value } = schemas.createLobby.validate(payload);
            if (error) return sendError(ws, `Invalid lobby options: ${error.details[0].message}`);

            const newLobby = lobbyManager.createNewLobby(value);
            ws.lobbyCode = newLobby.code;
            ws.userRole = 'ref';
            
            const { rejoinToken } = newLobby.participants.ref;
            newLobby.participants.ref.status = "connected";
            newLobby.participants.ref.rejoinToken = rejoinToken;

            ws.send(JSON.stringify({ type: 'lobbyCreated', payload: { ...newLobby, role: 'ref', rejoinToken } }));
            break;
        }

        case 'getPublicLobbies': {
            ws.send(JSON.stringify({ type: 'publicLobbiesList', payload: { lobbies: lobbyManager.getPublicLobbies() } }));
            break;
        }

        case 'getLobbyInfo': {
            if (!lobby) return sendError(ws, 'Lobby not found.');
            ws.send(JSON.stringify({ type: 'lobbyInfo', payload: { code: lobby.code, participants: lobby.participants } }));
            break;
        }

        case 'joinLobby': {
            const { error, value } = schemas.joinLobby.validate(payload);
            if (error) return sendError(ws, `Invalid join options: ${error.details[0].message}`);

            const result = lobbyManager.joinLobby(value.lobbyCode.toUpperCase(), value.role, value.name);
            if (result.error) return sendError(ws, result.error);

            ws.lobbyCode = result.lobby.code;
            ws.userRole = value.role;
            
            ws.send(JSON.stringify({ type: 'lobbyJoined', payload: { ...result.lobby, role: ws.userRole, rejoinToken: result.rejoinToken } }));
            lobbyManager.broadcastState(ws.lobbyCode, wss);
            break;
        }
        
        case 'rejoinLobby': {
            const { role, rejoinToken } = payload;
            if (!lobby || !role || !rejoinToken) return sendError(ws, 'Invalid rejoin request.');
            
            const result = lobbyManager.rejoinLobby(lobby.code, role, rejoinToken);
            if (result.error) return sendError(ws, result.error);

            ws.lobbyCode = result.lobby.code;
            ws.userRole = role;
            ws.send(JSON.stringify({ type: 'lobbyJoined', payload: { ...result.lobby, role: ws.userRole, rejoinToken } }));
            lobbyManager.broadcastState(ws.lobbyCode, wss);
            break;
        }

        case 'rosterSelect': {
            if (!lobby) return;
            const { player, id } = payload;
            const result = draftLogic.handleIdSelection(lobby, player, id);
            if (result.error) return sendError(ws, result.error);

            lobbyManager.updateLobbyActivity(lobby.code);
            lobbyManager.persistLobbiesToDisk();
            lobbyManager.broadcastState(lobby.code, wss);
            break;
        }
        
        case 'rosterSet': {
            if (!lobby) return;
            const { error, value } = schemas.rosterSet.validate(payload);
            if (error) return sendError(ws, `Invalid roster data: ${error.details[0].message}`);
            
            if (lobby.participants[value.player].ready) return sendError(ws, "Player is locked in.");
            lobby.roster[value.player] = value.roster;
            
            lobbyManager.updateLobbyActivity(lobby.code);
            lobbyManager.persistLobbiesToDisk();
            lobbyManager.broadcastState(lobby.code, wss);
            break;
        }
        
        case 'updateReady': {
            if (!lobby) return;
            const { player } = payload;
            const participant = lobby.participants[player];
            if (!participant) return sendError(ws, "Invalid player.");
            
            if (!participant.ready && lobby.roster[player].length !== config.ROSTER_SIZE) {
                return sendError(ws, `Roster must have ${config.ROSTER_SIZE} IDs.`);
            }
            participant.ready = !participant.ready;
            
            lobbyManager.updateLobbyActivity(lobby.code);
            lobbyManager.persistLobbiesToDisk();
            lobbyManager.broadcastState(lobby.code, wss);
            break;
        }
        
        case 'startCoinFlip': {
            if (!lobby || actingPlayer !== 'ref') return;
            lobby.draft.phase = 'coinFlip';
            lobby.draft.coinFlipWinner = Math.random() < 0.5 ? 'p1' : 'p2';
            
            lobbyManager.updateLobbyActivity(lobby.code);
            lobbyManager.persistLobbiesToDisk();
            lobbyManager.broadcastState(lobby.code, wss);
            break;
        }

        case 'setTurnOrder': {
            if (!lobby || (actingPlayer !== lobby.draft.coinFlipWinner && actingPlayer !== 'ref')) return;
            const { choice } = payload;
            const { draft } = lobby;

            if (choice === 'second') {
                draft.playerOrder = (draft.coinFlipWinner === 'p1') ? ['p2', 'p1'] : ['p1', 'p2'];
            } else { // 'first'
                draft.playerOrder = (draft.coinFlipWinner === 'p1') ? ['p1', 'p2'] : ['p2', 'p1'];
            }
            
            draft.phase = 'egoBan';
            draft.action = 'egoBan';
            draft.currentPlayer = draft.playerOrder[0];
            
            lobbyManager.updateLobbyActivity(lobby.code);
            lobbyManager.persistLobbiesToDisk();
            lobbyManager.broadcastState(lobby.code, wss);
            break;
        }

        case 'draftAction': {
            if (!lobby) return;
            const { selectedId } = payload;
            const result = draftLogic.handleDraftAction(lobby, actingPlayer, selectedId);
            if (result.error) return sendError(ws, result.error);

            lobbyManager.updateLobbyActivity(lobby.code);
            lobbyManager.persistLobbiesToDisk();
            lobbyManager.broadcastState(lobby.code, wss);
            break;
        }

        default:
            sendError(ws, `Unknown message type: ${type}`);
            break;
    }
}

module.exports = { handleWebSocketMessage };
