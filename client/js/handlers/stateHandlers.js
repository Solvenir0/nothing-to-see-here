// client/js/handlers/stateHandlers.js
// WebSocket lifecycle, message dispatch, and lobby state handlers.

import { TIMING } from '../config.js';
import { state, elements } from '../state.js';
import { showNotification, showSideChangeNotification } from '../utils/core.js';
import { startKeepAlive, stopKeepAlive } from '../utils/keepAlive.js';
import { showRoleSelectionModal } from '../rendering/rosterPhase.js';
import { refreshInterfaceBasedOnGameState } from '../rendering/navigation.js';

export let rejoinTimeout;

export function connectWebSocket() {
    if (state.socket && state.socket.readyState !== WebSocket.CLOSED) {
        state.socket.close();
    }
    const loc = window.location;
    const wsProtocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    const remoteUrl = `${wsProtocol}//${window.location.host}`;
    state.socket = new WebSocket(remoteUrl);

    elements.connectionStatus.className = 'connection-status connecting';
    elements.connectionStatus.innerHTML = '<i class="fas fa-plug"></i> <span>Connecting...</span>';

    state.socket.onopen = () => {
        elements.connectionStatus.className = 'connection-status connected';
        elements.connectionStatus.innerHTML = '<i class="fas fa-plug"></i> <span>Connected</span>';
        try {
            const session = JSON.parse(localStorage.getItem('limbusDraftSession'));
            if (session && session.lobbyCode && session.userRole && session.rejoinToken) {
                elements.rejoinOverlay.style.display = 'flex';
                sendMessage({ type: 'rejoinLobby', lobbyCode: session.lobbyCode, role: session.userRole, rejoinToken: session.rejoinToken });
                rejoinTimeout = setTimeout(() => {
                    if (elements.rejoinOverlay.style.display === 'flex') {
                        elements.rejoinOverlay.style.display = 'none';
                        try { localStorage.removeItem('limbusDraftSession'); } catch (e) {}
                        showNotification('Failed to rejoin lobby. Session cleared.', true);
                    }
                }, TIMING.RECONNECT_ATTEMPT_DELAY);
            }
        } catch (error) {
            console.error('Failed to parse session storage:', error);
            try { localStorage.removeItem('limbusDraftSession'); } catch (e) {}
        }
    };

    state.socket.onmessage = (event) => {
        try { handleServerMessage(JSON.parse(event.data)); }
        catch (error) { showNotification('Received invalid message from server', true); }
    };

    state.socket.onclose = () => {
        elements.connectionStatus.className = 'connection-status';
        elements.connectionStatus.innerHTML = '<i class="fas fa-plug"></i> <span>Disconnected</span>';
        if (state.timerInterval) clearInterval(state.timerInterval);
        state.lastCountdownSecond = null;
        stopKeepAlive();
    };

    state.socket.onerror = (error) => console.error('WebSocket error:', error);
}

export function sendMessage(message) {
    if (state.socket && state.socket.readyState === WebSocket.OPEN) {
        try { state.socket.send(JSON.stringify(message)); }
        catch (error) { showNotification('Failed to send message to server', true); }
    } else {
        console.warn('Cannot send message: WebSocket is not connected', message);
    }
}

export function handleServerMessage(message) {
    switch (message.type) {
        case 'lobbyCreated': handleLobbyCreated(message); break;
        case 'lobbyJoined': handleLobbyJoined(message); break;
        case 'stateUpdate':
            if (message.newRole && message.newRole !== state.userRole) {
                state.userRole = message.newRole;
                try {
                    const session = JSON.parse(localStorage.getItem('limbusDraftSession'));
                    if (session) {
                        session.userRole = message.newRole;
                        localStorage.setItem('limbusDraftSession', JSON.stringify(session));
                    }
                } catch (error) {}
            }
            handleStateUpdate(message);
            break;
        case 'lobbyInfo': showRoleSelectionModal(message.lobby); break;
        case 'notification': showNotification(message.text); break;
        case 'error':
            showNotification(`Error: ${message.message}`, true);
            if (message.message.includes('rejoin') || message.message.includes('Clearing session')) {
                try { localStorage.removeItem('limbusDraftSession'); } catch (e) {}
                elements.rejoinOverlay.style.display = 'none';
                if (rejoinTimeout) clearTimeout(rejoinTimeout);
            }
            break;
        case 'keepAliveAck': console.log('Keep-alive acknowledged by server'); break;
    }
}

export function handleLobbyCreated(message) {
    handleLobbyJoined(message);
}

export function handleLobbyJoined(message) {
    if (rejoinTimeout) clearTimeout(rejoinTimeout);
    elements.roleSelectionModal.classList.add('hidden');
    elements.rejoinOverlay.style.display = 'none';
    state.lobbyCode = message.lobbyCode || message.code;
    state.userRole = message.role;
    state.rejoinToken = message.rejoinToken;
    if (state.rejoinToken) {
        try {
            localStorage.setItem('limbusDraftSession', JSON.stringify({
                lobbyCode: state.lobbyCode,
                userRole: state.userRole,
                rejoinToken: state.rejoinToken
            }));
        } catch (error) {
            showNotification('Warning: Session could not be saved for auto-rejoin', true);
        }
    }
    startKeepAlive();
    handleStateUpdate(message);
    showNotification(`Joined lobby as ${state.participants[state.userRole].name}`);
}

export function handleStateUpdate(message) {
    const prevHistoryLen = (state.draft.history || []).length;
    const wasUserRole = state.userRole;
    const newUserRole = message.newRole || state.userRole;
    const rolesSwapped = message.state?.rolesSwapped || false;
    Object.assign(state.participants, message.state.participants);
    Object.assign(state.roster, message.state.roster);
    if (message.state.draft) {
        Object.keys(message.state.draft).forEach(key => {
            if (
                typeof message.state.draft[key] === 'object' &&
                message.state.draft[key] !== null &&
                !Array.isArray(message.state.draft[key])
            ) {
                if (!state.draft[key]) state.draft[key] = {};
                Object.assign(state.draft[key], message.state.draft[key]);
            } else {
                state.draft[key] = message.state.draft[key];
            }
        });
    }
    if (rolesSwapped && wasUserRole && wasUserRole !== newUserRole) {
        showSideChangeNotification(wasUserRole, newUserRole);
    }

    elements.lobbyCodeDisplay.textContent = state.lobbyCode;
    refreshInterfaceBasedOnGameState();
}
