// client/js/utils/storage.js
// Roster code encode/decode. Depends on state (masterIDList, builderRoster) and core (showNotification).

import { state } from '../state.js';
import { showNotification } from './core.js';

export function generateRosterCode() {
    if (state.builderRoster.length !== state.builderRosterSize) return null;
    try {
        const indices = state.builderRoster.map(slug => {
            const index = state.masterIDList.findIndex(id => id.id === slug);
            return index > -1 ? index : 255;
        });
        const uint8Array = new Uint8Array(indices);
        const binaryString = String.fromCharCode.apply(null, uint8Array);
        return btoa(binaryString);
    } catch (e) {
        console.error('Error generating roster code:', e);
        return null;
    }
}

export function loadRosterFromCode(code) {
    try {
        const binaryString = atob(code);
        const rosterSize = binaryString.length;

        if (rosterSize !== 42 && rosterSize !== 52) {
            showNotification(`Invalid roster code: unsupported size (${rosterSize}).`, true);
            return null;
        }

        const uint8Array = new Uint8Array(binaryString.split('').map(c => c.charCodeAt(0)));
        const rosterSlugs = Array.from(uint8Array).map(index => {
            return (index < state.masterIDList.length) ? state.masterIDList[index].id : null;
        }).filter(Boolean);

        if (rosterSlugs.length !== rosterSize) {
            showNotification('Invalid roster code: contains invalid ID data.', true);
            return null;
        }
        return rosterSlugs;
    } catch (e) {
        console.error('Error decoding roster code:', e);
        showNotification('Invalid roster code format.', true);
        return null;
    }
}
