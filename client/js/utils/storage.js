// client/js/utils/storage.js
// Roster code encode/decode. Depends on state (idSlotMap, slotToId, builderRoster) and core (showNotification).
//
// Encoding: each ID → Uint16 value (sinnerIndex * 40 + withinSinnerIndex) → Uint16Array → btoa
// Lookup tables built at boot from data/id-numbers.json via main.js.
// To add new IDs: run `node scripts/update-id-numbers.js` after updating data/identities.json.

import { state } from '../state.js';
import { showNotification } from './core.js';

export function generateRosterCode() {
    if (state.builderRoster.length !== state.builderRosterSize) return null;
    try {
        const values = state.builderRoster.map(slug => {
            const value = state.idSlotMap[slug];
            if (value === undefined) throw new Error(`Unknown slug: ${slug}`);
            return value;
        });
        const uint16 = new Uint16Array(values);
        const bytes = new Uint8Array(uint16.buffer);
        return btoa(String.fromCharCode(...bytes));
    } catch (e) {
        console.error('Error generating roster code:', e);
        return null;
    }
}

export function loadRosterFromCode(code) {
    try {
        const binaryString = atob(code);
        const bytes = new Uint8Array(binaryString.split('').map(c => c.charCodeAt(0)));

        if (bytes.length % 2 !== 0) {
            showNotification('Invalid roster code format.', true);
            return null;
        }

        const uint16 = new Uint16Array(bytes.buffer);
        const rosterSize = uint16.length;

        if (rosterSize !== 42 && rosterSize !== 52) {
            showNotification(`Invalid roster code: unsupported size (${rosterSize}).`, true);
            return null;
        }

        const rosterSlugs = Array.from(uint16).map(value => {
            const slug = state.slotToId[value];
            return slug ?? null;
        });

        if (rosterSlugs.includes(null)) {
            showNotification('Invalid roster code: contains unknown ID data.', true);
            return null;
        }
        return rosterSlugs;
    } catch (e) {
        console.error('Error decoding roster code:', e);
        showNotification('Invalid roster code format.', true);
        return null;
    }
}
