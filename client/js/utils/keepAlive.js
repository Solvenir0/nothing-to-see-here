// client/js/utils/keepAlive.js
// Keeps the WebSocket connection alive during active draft phases.
// Call init(sendMessage) once during app startup before using startKeepAlive.

import { TIMING } from '../config.js';
import { state } from '../state.js';

let _sendMessage = null;

export function init(sendMessage) {
    _sendMessage = sendMessage;
}

export function startKeepAlive() {
    if (state.keepAliveInterval) return; // Already running
    console.log('Starting keep-alive system for active draft phases');
    state.keepAliveInterval = setInterval(() => {
        if (shouldSendKeepAlive()) {
            console.log('Sending keep-alive message to prevent server sleep');
            _sendMessage({ type: 'keepAlive', lobbyCode: state.lobbyCode });
        }
    }, TIMING.KEEP_ALIVE_INTERVAL);
}

export function stopKeepAlive() {
    if (state.keepAliveInterval) {
        console.log('Stopping keep-alive system');
        clearInterval(state.keepAliveInterval);
        state.keepAliveInterval = null;
    }
}

export function shouldSendKeepAlive() {
    if (!state.lobbyCode || !state.socket || state.socket.readyState !== WebSocket.OPEN) {
        return false;
    }
    const activeDraftPhases = ['coinFlip', 'egoBan', 'ban', 'pick', 'midBan', 'pick2', 'pick_s2'];
    return activeDraftPhases.includes(state.draft.phase);
}
