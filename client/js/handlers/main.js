// client/js/handlers/main.js
// Application entry point. Imports all modules, injects dependencies, and boots the app.

import { SINNER_ORDER } from '../config.js';
import { state, elements } from '../state.js';
import { idCsvData, egoData } from '../../../data.js';
import { parseIDCSV, parseEGOData } from '../rendering/idElements.js';
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

document.addEventListener('DOMContentLoaded', () => {
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
        cacheDOMElements();

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

        // Parse and cache data
        state.masterIDList = parseIDCSV(idCsvData);
        state.builderMasterIDList = state.masterIDList.filter(id => !id.name.includes('LCB Sinner'));
        state.masterEGOList = parseEGOData(egoData);

        state.idsBySinner = {};
        SINNER_ORDER.forEach(sinnerName => {
            state.idsBySinner[sinnerName] = state.builderMasterIDList.filter(id => id.sinner === sinnerName);
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
