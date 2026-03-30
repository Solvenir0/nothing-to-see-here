// client/js/utils/storage.js
// Roster code encode/decode. Depends on state (masterIDList, builderRoster) and core (showNotification).

import { state } from '../state.js';
import { showNotification } from './core.js';

export function generateRosterCode() {
    if (state.builderRoster.length !== state.builderRosterSize) return null;
    try {
        return btoa(state.builderRoster.join('|'));
    } catch (e) {
        console.error('Error generating roster code:', e);
        return null;
    }
}

export function loadRosterFromCode(code) {
    try {
        const decoded = atob(code);
        const rosterSlugs = decoded.split('|');
        const rosterSize = rosterSlugs.length;

        if (rosterSize !== 42 && rosterSize !== 52) {
            showNotification(`Invalid roster code: unsupported size (${rosterSize}).`, true);
            return null;
        }

        const validated = rosterSlugs.map(slug =>
            state.masterIDList.find(id => id.id === slug)?.id ?? null
        );

        if (validated.includes(null)) {
            showNotification('Invalid roster code: contains invalid ID data.', true);
            return null;
        }
        return validated;
    } catch (e) {
        console.error('Error decoding roster code:', e);
        showNotification('Invalid roster code format.', true);
        return null;
    }
}
