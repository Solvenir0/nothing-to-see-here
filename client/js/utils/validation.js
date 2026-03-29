// client/js/utils/validation.js
// Client-side input and roster validation helpers.

import { state } from '../state.js';
import { showNotification } from './core.js';
import { loadRosterFromCode } from './storage.js';

export function validateAndTrimInput(input, fieldName) {
    const trimmed = input.trim();
    if (!trimmed) {
        showNotification(`Please enter a ${fieldName}.`, true);
        return null;
    }
    return trimmed;
}

export function validateRosterSize(roster, requiredSize, action = 'proceed') {
    if (roster.length !== requiredSize) {
        showNotification(`Must select ${requiredSize} IDs to ${action}.`, true);
        return false;
    }
    return true;
}

export function validateRosterCodeSize(rosterCode, requiredSize) {
    if (!rosterCode) {
        showNotification('Please enter a roster code.', true);
        return false;
    }

    const roster = loadRosterFromCode(rosterCode);
    if (!roster) {
        return false; // loadRosterFromCode already shows error notification
    }

    if (roster.length !== requiredSize) {
        showNotification(`Roster code is for ${roster.length} IDs, but lobby requires ${requiredSize}.`, true);
        return false;
    }

    return roster;
}

export function validateUserPermission(userRole, targetRole) {
    return userRole === targetRole || userRole === 'ref';
}
