// client/js/handlers/main.js
// Application entry point. Imports all modules, injects dependencies, and boots the app.

import { SINNER_ORDER } from '../config.js';
import { state, elements } from '../state.js';
import { parseIdentityData, parseEGOData } from '../rendering/idElements.js';
import { switchView } from '../rendering/navigation.js';
import { renderRosterBuilder, setupAdvancedRandomUI } from '../rendering/rosterBuilder.js';
import { createFilterBarHTML } from '../rendering/rosterPhase.js';
import { init as initKeepAlive } from '../utils/keepAlive.js';
import { init as initActions, toggleBuilderIdSelection } from './actions.js';
import { init as initRosterPhase } from '../rendering/rosterPhase.js';
import { init as initDraftPhase } from '../rendering/draftPhase.js';
import { init as initRosterBuilder } from '../rendering/rosterBuilder.js';
import { connectWebSocket, sendMessage } from './stateHandlers.js';
import { cacheDOMElements, setupFilterBar, setupEventListeners } from './eventHandlers.js';
import { loadSavedName } from '../utils/storage.js';
import { setupDraftMakerListeners } from './draftMakerEvents.js';

document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM Content Loaded - Starting initialization');

    // Create rejoin overlay dynamically so it's ready before cacheDOMElements
    const rejoinOverlay = document.createElement('div');
    rejoinOverlay.id = 'rejoin-overlay';
    rejoinOverlay.className = 'rejoin-overlay';
    rejoinOverlay.innerHTML = `
        <i class="fas fa-sync fa-spin"></i>
        <p>Attempting to rejoin lobby...</p>
        <button class="btn btn-secondary" id="cancel-rejoin-btn">Cancel</button>`;
    document.body.prepend(rejoinOverlay);

    try {
        // Fetch JSON data files (single source of truth)
        const [identities, egos, idNumbers] = await Promise.all([
            fetch('/data/identities.json').then(r => r.json()),
            fetch('/data/egos.json').then(r => r.json()),
            fetch('/data/id-numbers.json').then(r => r.json()),
        ]);

        cacheDOMElements();

        // Prefill player name inputs from localStorage
        const _savedName = loadSavedName();
        if (_savedName) {
            if (elements.playerNameInput) elements.playerNameInput.value = _savedName;
            if (elements.draftMakerName) elements.draftMakerName.value = _savedName;
        }

        // Inject sendMessage into modules that need it
        initKeepAlive(sendMessage);
        initActions(sendMessage);
        initRosterPhase(sendMessage);
        initDraftPhase(sendMessage);
        initRosterBuilder(toggleBuilderIdSelection);

        // Build filter bar HTML
        elements.globalFilterBarRoster.innerHTML = createFilterBarHTML({ showSinnerFilter: true });
        elements.globalFilterBarBuilder.innerHTML = createFilterBarHTML({ showSinnerFilter: false });
        elements.globalFilterBarDraft.innerHTML = createFilterBarHTML({ showSinnerFilter: true });
        setupFilterBar('global-filter-bar-roster', state.filters);
        setupFilterBar('global-filter-bar-builder', state.filters);
        setupFilterBar('global-filter-bar-draft', state.draftFilters);
        setupDraftMakerListeners();

        // Parse and cache data
        state.masterIDList = parseIdentityData(identities);
        state.builderMasterIDList = state.masterIDList.filter(id => !id.name.includes('LCB Sinner'));
        state.masterEGOList = parseEGOData(egos);

        state.idsBySinner = {};
        SINNER_ORDER.forEach(sinnerName => {
            state.idsBySinner[sinnerName] = state.builderMasterIDList.filter(id => id.sinner === sinnerName);
        });

        // Build roster-code lookup tables from id-numbers.json
        SINNER_ORDER.forEach((sinnerName, sinnerIdx) => {
            (idNumbers[sinnerName] || []).forEach((slug, pos) => {
                const value = sinnerIdx * 40 + pos;
                state.idSlotMap[slug] = value;
                state.slotToId[value] = slug;
            });
        });

        setupAdvancedRandomUI();
        setupEventListeners();
        connectWebSocket();
        switchView('mainPage');
        console.log('Initialization complete');
    } catch (error) {
        console.error('Error during initialization:', error);
        try {
            switchView('mainPage');
        } catch (fallbackError) {
            console.error('Even fallback failed:', fallbackError);
        }
    }
});

