// client/js/handlers/actions.js
// Client-side action dispatchers: wrap sendMessage calls for lobby and draft interactions.

import { state } from '../state.js';
import { showNotification } from '../utils/core.js';
import { renderRosterBuilder } from '../rendering/rosterBuilder.js';

// sendMessage is injected from stateHandlers to avoid circular imports
let _sendMessage = null;

export function init(sendMessage) {
    _sendMessage = sendMessage;
}

export function toggleIDSelection(player, id) {
    _sendMessage({ type: 'rosterSelect', lobbyCode: state.lobbyCode, player, id });
}

export function setPlayerRoster(player, roster) {
    _sendMessage({ type: 'rosterSet', lobbyCode: state.lobbyCode, player, roster });
}

export function hoverEgoToBan(egoId) {
    _sendMessage({ type: 'draftHover', lobbyCode: state.lobbyCode, payload: { id: egoId, type: 'ego' } });
}

export function hoverDraftID(id) {
    _sendMessage({ type: 'draftHover', lobbyCode: state.lobbyCode, payload: { id, type: 'id' } });
}

export function confirmDraftAction(type) {
    _sendMessage({ type: 'draftConfirm', lobbyCode: state.lobbyCode, payload: { type } });
}

export function toggleBuilderIdSelection(id) {
    const index = state.builderRoster.indexOf(id);
    if (index > -1) {
        state.builderRoster.splice(index, 1);
    } else {
        if (state.builderRoster.length < state.builderRosterSize) {
            state.builderRoster.push(id);
        } else {
            showNotification(`You can only select ${state.builderRosterSize} IDs.`);
        }
    }
    renderRosterBuilder();
}
