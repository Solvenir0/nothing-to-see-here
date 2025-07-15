// server.js
const PORT = process.env.PORT || 8080;
const WebSocket = require('ws');
const crypto = require('crypto');
const express = require('express');
const path = require('path');
const app = express();


console.log(`WebSocket server running on port ${PORT}`);
const lobbies = new Map();
const clients = new Map();
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
// Handle all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = app.listen(PORT, () => {
  console.log(`HTTP server running on port ${PORT}`);
});

// Attach WebSocket server to HTTP server
const wss = new WebSocket.Server({ server });
function generateLobbyCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function broadcastToLobby(lobbyCode, message, excludeUserId = null) {
    const lobby = lobbies.get(lobbyCode);
    if (!lobby) return;

    lobby.participants.forEach(participant => {
        if (participant.userId === excludeUserId) return;
        
        const client = clients.get(participant.userId);
        if (client && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

function updateLobbyStatus(lobbyCode) {
    const lobby = lobbies.get(lobbyCode);
    if (!lobby) return;

    // Update participant connection status
    lobby.participants.forEach(participant => {
        const client = clients.get(participant.userId);
        participant.status = client && client.readyState === WebSocket.OPEN ? 
            'connected' : 'disconnected';
    });

    broadcastToLobby(lobbyCode, {
        type: 'participantUpdate',
        participants: lobby.participants
    });
}

wss.on('connection', ws => {
    const userId = crypto.randomBytes(16).toString('hex');
    clients.set(userId, ws);
    let currentLobby = null;

    ws.on('message', data => {
        try {
            const message = JSON.parse(data);
            console.log('Received:', message);

            switch (message.type) {
                case 'createLobby':
                    const lobbyCode = generateLobbyCode();
                    currentLobby = lobbyCode;
                    
                    lobbies.set(lobbyCode, {
                        participants: [{
                            userId,
                            role: 'ref',
                            name: 'Referee',
                            status: 'connected',
                            ready: false
                        }],
                        roster: {
                            p1: [],
                            p2: []
                        },
                        draft: {
                            phase: 'roster',
                            step: 0,
                            currentPlayer: '',
                            action: '',
                            actionCount: 0,
                            available: { p1: [], p2: [] },
                            idBans: { p1: [], p2: [] },
                            picks: { p1: [], p2: [] }
                        },
                        version: 0
                    });

                    ws.send(JSON.stringify({
                        type: 'lobbyCreated',
                        code: lobbyCode
                    }));
                    break;

                case 'joinLobby':
                    const lobby = lobbies.get(message.lobbyCode);
                    if (!lobby) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Lobby not found'
                        }));
                        return;
                    }

                    // Check if role is available
                    const roleTaken = lobby.participants.some(p => p.role === message.role);
                    if (roleTaken) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Role already taken'
                        }));
                        return;
                    }

                    currentLobby = message.lobbyCode;
                    lobby.participants.push({
                        userId,
                        role: message.role,
                        name: message.role === 'ref' ? 'Referee' : `Player ${message.role.slice(1)}`,
                        status: 'connected',
                        ready: false
                    });

                    // Send current state to the new participant
                    ws.send(JSON.stringify({
                        type: 'lobbyJoined',
                        lobbyCode: message.lobbyCode,
                        role: message.role,
                        state: {
                            participants: lobby.participants,
                            roster: lobby.roster,
                            draft: lobby.draft
                        }
                    }));

                    // Notify others
                    broadcastToLobby(message.lobbyCode, {
                        type: 'participantUpdate',
                        participants: lobby.participants
                    }, userId);
                    
                    broadcastToLobby(message.lobbyCode, {
                        type: 'notification',
                        text: `${message.role === 'ref' ? 'Referee' : 'Player ' + message.role.slice(1)} joined the lobby!`
                    });
                    break;

                case 'rejoinLobby':
                    const rejoinLobby = lobbies.get(message.lobbyCode);
                    if (!rejoinLobby) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Lobby not found'
                        }));
                        return;
                    }

                    const participant = rejoinLobby.participants.find(p => p.userId === message.userId);
                    if (!participant) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Participant not found'
                        }));
                        return;
                    }

                    currentLobby = message.lobbyCode;
                    participant.status = 'connected';
                    
                    ws.send(JSON.stringify({
                        type: 'lobbyJoined',
                        lobbyCode: message.lobbyCode,
                        role: participant.role,
                        state: {
                            participants: rejoinLobby.participants,
                            roster: rejoinLobby.roster,
                            draft: rejoinLobby.draft,
                            version: rejoinLobby.version
                        }
                    }));

                    broadcastToLobby(message.lobbyCode, {
                        type: 'participantUpdate',
                        participants: rejoinLobby.participants
                    }, userId);
                    
                    broadcastToLobby(message.lobbyCode, {
                        type: 'notification',
                        text: `${participant.role === 'ref' ? 'Referee' : 'Player ' + participant.role.slice(1)} reconnected!`
                    });
                    break;

                case 'updateRoster':
                    const rosterLobby = lobbies.get(message.lobbyCode);
                    if (!rosterLobby) return;

                    if (rosterLobby.roster[message.player]) {
                        rosterLobby.roster[message.player] = message.roster;
                        rosterLobby.version++;
                        
                        broadcastToLobby(message.lobbyCode, {
                            type: 'rosterUpdate',
                            player: message.player,
                            roster: message.roster
                        });
                    }
                    break;

                case 'updateReady':
                    const readyLobby = lobbies.get(message.lobbyCode);
                    if (!readyLobby) return;

                    const readyParticipant = readyLobby.participants.find(p => 
                        p.userId === userId && p.role === message.player
                    );
                    
                    if (readyParticipant) {
                        readyParticipant.ready = message.ready;
                        readyLobby.version++;
                        
                        broadcastToLobby(message.lobbyCode, {
                            type: 'readyUpdate',
                            player: message.player,
                            ready: message.ready
                        });

                        // Check if both players are ready
                        const p1 = readyLobby.participants.find(p => p.role === 'p1');
                        const p2 = readyLobby.participants.find(p => p.role === 'p2');
                        
                        if (p1 && p2 && p1.ready && p2.ready) {
                            broadcastToLobby(message.lobbyCode, {
                                type: 'notification',
                                text: 'Both players are ready! Referee can start the draft'
                            });
                        }
                    }
                    break;

                case 'startDraft':
                    const startLobby = lobbies.get(message.lobbyCode);
                    if (!startLobby) return;

                    startLobby.draft = {
                        phase: 'ban',
                        step: 0,
                        currentPlayer: 'p1',
                        action: 'ban',
                        actionCount: 1,
                        available: {
                            p1: [...startLobby.roster.p1],
                            p2: [...startLobby.roster.p2]
                        },
                        idBans: { p1: [], p2: [] },
                        picks: { p1: [], p2: [] }
                    };
                    
                    startLobby.version++;
                    
                    broadcastToLobby(message.lobbyCode, {
                        type: 'draftAction',
                        draft: startLobby.draft
                    });
                    
                    broadcastToLobby(message.lobbyCode, {
                        type: 'notification',
                        text: 'Draft started! Player 1 to ban first'
                    });
                    break;

                case 'nextPhase':
                    const nextPhaseLobby = lobbies.get(message.lobbyCode);
                    if (!nextPhaseLobby) return;

                    const draft = nextPhaseLobby.draft;
                    
                    switch (draft.phase) {
                        case 'ban':
                            if (draft.step < 7) {
                                draft.step++;
                                draft.currentPlayer = draft.currentPlayer === 'p1' ? 'p2' : 'p1';
                                draft.action = 'ban';
                                draft.actionCount = 1;
                            } else {
                                draft.phase = 'pick';
                                draft.step = 0;
                                draft.currentPlayer = 'p1';
                                draft.action = 'pick';
                                draft.actionCount = 1;
                            }
                            break;
                            
                        case 'pick':
                            const pickSequence = [
                                { player: 'p1', count: 1 },
                                { player: 'p2', count: 2 },
                                { player: 'p1', count: 2 },
                                { player: 'p2', count: 2 },
                                { player: 'p1', count: 2 },
                                { player: 'p2', count: 2 },
                                { player: 'p1', count: 1 }
                            ];
                            
                            if (draft.step < pickSequence.length - 1) {
                                draft.step++;
                                const next = pickSequence[draft.step];
                                draft.currentPlayer = next.player;
                                draft.action = 'pick';
                                draft.actionCount = next.count;
                            } else {
                                draft.phase = 'complete';
                            }
                            break;
                    }
                    
                    nextPhaseLobby.version++;
                    
                    broadcastToLobby(message.lobbyCode, {
                        type: 'draftAction',
                        draft: nextPhaseLobby.draft
                    });
                    
                    const phaseName = draft.phase === 'ban' ? 'Ban' : draft.phase === 'pick' ? 'Pick' : 'Complete';
                    broadcastToLobby(message.lobbyCode, {
                        type: 'notification',
                        text: `Phase changed to ${phaseName} - Step ${draft.step + 1}`
                    });
                    break;

                case 'completeDraft':
                    const completeLobby = lobbies.get(message.lobbyCode);
                    if (!completeLobby) return;

                    completeLobby.draft.phase = 'complete';
                    completeLobby.version++;
                    
                    broadcastToLobby(message.lobbyCode, {
                        type: 'draftAction',
                        draft: completeLobby.draft
                    });
                    
                    broadcastToLobby(message.lobbyCode, {
                        type: 'notification',
                        text: 'Draft completed!'
                    });
                    break;

                case 'banID':
                case 'pickID':
                    const actionLobby = lobbies.get(message.lobbyCode);
                    if (!actionLobby) return;

                    const action = message.type === 'banID' ? 'ban' : 'pick';
                    const player = message.player;
                    const id = message.id;
                    const opponent = player === 'p1' ? 'p2' : 'p1';
                    
                    // Update rosters
                    if (action === 'ban') {
                        // Remove from both rosters
                        actionLobby.roster[player] = actionLobby.roster[player].filter(i => i !== id);
                        actionLobby.roster[opponent] = actionLobby.roster[opponent].filter(i => i !== id);
                        actionLobby.draft.idBans[player].push(id);
                    } else {
                        // Remove from both rosters
                        actionLobby.roster[player] = actionLobby.roster[player].filter(i => i !== id);
                        actionLobby.roster[opponent] = actionLobby.roster[opponent].filter(i => i !== id);
                        actionLobby.draft.picks[player].push(id);
                    }
                    
                    // Remove from available
                    actionLobby.draft.available[player] = actionLobby.draft.available[player].filter(i => i !== id);
                    actionLobby.draft.available[opponent] = actionLobby.draft.available[opponent].filter(i => i !== id);
                    
                    // Reduce action count
                    actionLobby.draft.actionCount--;
                    
                    actionLobby.version++;
                    
                    // Broadcast updates
                    broadcastToLobby(message.lobbyCode, {
                        type: 'rosterUpdate',
                        player: 'p1',
                        roster: actionLobby.roster.p1
                    });
                    
                    broadcastToLobby(message.lobbyCode, {
                        type: 'rosterUpdate',
                        player: 'p2',
                        roster: actionLobby.roster.p2
                    });
                    
                    broadcastToLobby(message.lobbyCode, {
                        type: 'draftAction',
                        draft: actionLobby.draft
                    });
                    
                    broadcastToLobby(message.lobbyCode, {
                        type: 'notification',
                        text: `${player === 'p1' ? 'Player 1' : 'Player 2'} ${action}${action === 'ban' ? 'ned' : 'ed'} an ID`
                    });
                    break;

                case 'leaveLobby':
                    const leaveLobby = lobbies.get(message.lobbyCode);
                    if (!leaveLobby) return;

                    // Remove participant
                    const index = leaveLobby.participants.findIndex(p => p.userId === userId);
                    if (index !== -1) {
                        leaveLobby.participants.splice(index, 1);
                        broadcastToLobby(message.lobbyCode, {
                            type: 'participantUpdate',
                            participants: leaveLobby.participants
                        });
                        
                        broadcastToLobby(message.lobbyCode, {
                            type: 'notification',
                            text: `A participant left the lobby`
                        });
                        
                        // Cleanup lobby if empty
                        if (leaveLobby.participants.length === 0) {
                            lobbies.delete(message.lobbyCode);
                        }
                    }
                    break;
            }
        } catch (err) {
            console.error('Error processing message:', err);
        }
    });

    ws.on('close', () => {
        clients.delete(userId);
        if (currentLobby) {
            updateLobbyStatus(currentLobby);
        }
    });
});

console.log('WebSocket server running on port 8080');
