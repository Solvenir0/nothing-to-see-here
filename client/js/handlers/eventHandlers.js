// client/js/handlers/eventHandlers.js
// DOM element caching, filter bar setup, and all event listener wiring.

import { TIMING, SINNER_ORDER, saveKoreanModeToStorage } from '../config.js';
import { state, elements } from '../state.js';
import { validateAndTrimInput, validateRosterSize, validateRosterCodeSize, validateUserPermission } from '../utils/validation.js';
import { createDebounceFunction } from '../utils/debounce.js';
import { showNotification, getTooltipElement } from '../utils/core.js';
import { loadRosterFromCode } from '../utils/storage.js';
import { stopKeepAlive } from '../utils/keepAlive.js';
import { switchView } from '../rendering/navigation.js';
import { filterAndRenderRosterSelection, renderEgoBanPhase, createFilterBarHTML } from '../rendering/rosterPhase.js';
import { updateDraftInstructions } from '../rendering/draftPhase.js';
import { renderRosterBuilder, setupAdvancedRandomUI, generateAdvancedRandomRoster } from '../rendering/rosterBuilder.js';
import { renderBannedEgosDisplay } from '../rendering/egoElements.js';
import { renderCompletedView } from '../rendering/completedView.js';
import { connectWebSocket, sendMessage, rejoinTimeout } from './stateHandlers.js';
import { setPlayerRoster, confirmDraftAction } from './actions.js';

export { setupAdvancedRandomUI, generateAdvancedRandomRoster, createFilterBarHTML };

export function setupFilterBar(barId, filterStateObject) {
    const bar = document.getElementById(barId);
    if (!bar) return;

    const update = () => {
        if (state.currentView === 'lobbyView') {
            if (state.draft.phase === 'roster') filterAndRenderRosterSelection();
            else updateDraftInstructions();
        } else if (state.currentView === 'rosterBuilderPage') {
            renderRosterBuilder();
        }
    };

    const debouncedUpdate = createDebounceFunction(update, 300);

    bar.addEventListener('input', (e) => {
        if (e.target.classList.contains('roster-search-input')) {
            filterStateObject.rosterSearch = e.target.value;
            debouncedUpdate();
        }
    });
    bar.addEventListener('change', (e) => {
        const filterType = e.target.dataset.filter;
        if (filterType) {
            filterStateObject[filterType] = e.target.value;
            update();
        }
    });
    bar.addEventListener('click', (e) => {
        if (e.target.closest('.reset-filters-btn')) {
            Object.keys(filterStateObject).forEach(key => filterStateObject[key] = '');
            bar.querySelectorAll('input, select').forEach(el => el.value = '');
            update();
        }
    });
}

export function cacheDOMElements() {
    elements.mainPage = document.getElementById('main-page');
    elements.lobbyView = document.getElementById('lobby-view');
    elements.rosterBuilderPage = document.getElementById('roster-builder-page');
    elements.completedView = document.getElementById('completed-view');
    elements.rejoinOverlay = document.getElementById('rejoin-overlay');
    elements.cancelRejoinBtn = document.getElementById('cancel-rejoin-btn');

    // Main Page
    elements.createLobbyBtn = document.getElementById('create-lobby');
    elements.goToBuilder = document.getElementById('go-to-builder');
    elements.playerNameInput = document.getElementById('player-name');
    elements.draftLogicSelect = document.getElementById('draft-logic-select');
    elements.matchTypeSelect = document.getElementById('match-type-select');
    elements.timerToggle = document.getElementById('timer-toggle');
    elements.rosterSizeSelect = document.getElementById('roster-size-select');
    elements.koreanToggle = document.getElementById('korean-display-toggle');
    elements.showRulesBtn = document.getElementById('show-rules-btn');
    elements.lobbyCodeInput = document.getElementById('lobby-code-input');
    elements.enterLobbyByCode = document.getElementById('enter-lobby-by-code');
    elements.builderRosterDescription = document.getElementById('builder-roster-description');

    // Modals
    elements.rulesModal = document.getElementById('rules-modal');
    elements.closeRulesBtn = document.getElementById('close-rules-btn');
    elements.roleSelectionModal = document.getElementById('role-selection-modal');
    elements.closeRoleModalBtn = document.getElementById('close-role-modal-btn');
    elements.roleModalLobbyCode = document.getElementById('role-modal-lobby-code');
    elements.modalRoleOptions = document.getElementById('modal-role-options');
    elements.confirmJoinBtn = document.getElementById('confirm-join-btn');

    // Shared
    elements.globalBackToMain = document.getElementById('global-back-to-main');
    elements.connectionStatus = document.getElementById('connection-status');
    elements.notification = document.getElementById('notification');

    // Lobby
    elements.lobbyCodeDisplay = document.getElementById('lobby-code-display');
    elements.toggleCodeVisibility = document.getElementById('toggle-code-visibility');
    elements.participantsList = document.getElementById('participants-list');
    elements.phaseTimer = document.getElementById('phase-timer');
    elements.refTimerControl = document.getElementById('ref-timer-control');
    elements.draftStatusPanel = document.getElementById('draft-status-panel');
    elements.currentPhase = document.getElementById('current-phase');
    elements.draftActionDescription = document.getElementById('draft-action-description');

    // Roster Phase (Lobby)
    elements.rosterPhase = document.getElementById('roster-phase');
    elements.rosterPhaseTitle = document.getElementById('roster-phase-title');
    elements.p1Panel = document.getElementById('p1-panel');
    elements.p2Panel = document.getElementById('p2-panel');
    elements.p1Roster = document.getElementById('p1-roster');
    elements.p2Roster = document.getElementById('p2-roster');
    elements.p1Counter = document.getElementById('p1-counter');
    elements.p2Counter = document.getElementById('p2-counter');
    elements.p1RosterSize = document.getElementById('p1-roster-size');
    elements.p2RosterSize = document.getElementById('p2-roster-size');
    elements.p1Random = document.getElementById('p1-random');
    elements.p2Random = document.getElementById('p2-random');
    elements.p1Clear = document.getElementById('p1-clear');
    elements.p2Clear = document.getElementById('p2-clear');
    elements.p1Ready = document.getElementById('p1-ready');
    elements.p2Ready = document.getElementById('p2-ready');
    elements.p1Status = document.getElementById('p1-status');
    elements.p2Status = document.getElementById('p2-status');
    elements.p1NameDisplay = document.getElementById('p1-name-display');
    elements.p2NameDisplay = document.getElementById('p2-name-display');
    elements.p1RosterCodeInput = document.getElementById('p1-roster-code-input');
    elements.p2RosterCodeInput = document.getElementById('p2-roster-code-input');
    elements.p1RosterLoad = document.getElementById('p1-roster-load');
    elements.p2RosterLoad = document.getElementById('p2-roster-load');
    elements.startCoinFlip = document.getElementById('start-coin-flip');

    // Roster Builder
    elements.builderSinnerNav = document.getElementById('builder-sinner-nav');
    elements.builderIdPool = document.getElementById('builder-id-pool');
    elements.builderSelectedRoster = document.getElementById('builder-selected-roster');
    elements.builderCounter = document.getElementById('builder-counter');
    elements.builderRosterSize = document.getElementById('builder-roster-size');
    elements.builderRosterSizeSelector = document.getElementById('builder-roster-size-selector');
    elements.builderRandom = document.getElementById('builder-random');
    elements.builderClear = document.getElementById('builder-clear');
    elements.builderRosterCodeDisplay = document.getElementById('builder-roster-code-display');
    elements.builderCopyCode = document.getElementById('builder-copy-code');
    elements.builderLoadCodeInput = document.getElementById('builder-load-code-input');
    elements.builderLoadCode = document.getElementById('builder-load-code');
    elements.toggleAdvancedRandom = document.getElementById('toggle-advanced-random');
    elements.advancedRandomOptions = document.getElementById('advanced-random-options');
    elements.sinnerSlidersContainer = document.getElementById('sinner-sliders-container');
    elements.totalMinDisplay = document.getElementById('total-min-display');
    elements.totalMaxDisplay = document.getElementById('total-max-display');
    elements.advancedRandomRosterSize = document.querySelectorAll('.advanced-random-roster-size');
    elements.builderAdvancedRandom = document.getElementById('builder-advanced-random');
    elements.advancedRandomSummary = document.getElementById('advanced-random-summary');

    // EGO Ban Phase
    elements.egoBanPhase = document.getElementById('ego-ban-phase');
    elements.egoBanTitle = document.getElementById('ego-ban-title');
    elements.egoSearchInput = document.getElementById('ego-search-input');
    elements.egoBanContainer = document.getElementById('ego-ban-container');
    elements.confirmEgoBans = document.getElementById('confirm-ego-bans');
    elements.confirmSelectionEgo = document.getElementById('confirm-selection-ego');
    elements.opponentRosterDisplay = document.getElementById('opponent-roster-display');
    elements.opponentRosterTitle = document.getElementById('opponent-roster-title');
    elements.opponentRosterList = document.getElementById('opponent-roster-list');
    elements.currentPlayerEgoBans = document.getElementById('current-player-ego-bans');
    elements.egoBanPlayerBansSection = document.getElementById('ego-ban-player-bans-section');
    elements.p1EgoBansPreview = document.getElementById('p1-ego-bans-preview');

    // ID Draft Phase
    elements.idDraftPhase = document.getElementById('id-draft-phase');
    elements.draftBannedEgosList = document.getElementById('draft-banned-egos-list');
    elements.completeDraft = document.getElementById('complete-draft');
    elements.p1DraftColumn = document.getElementById('p1-draft-column');
    elements.p2DraftColumn = document.getElementById('p2-draft-column');
    elements.draftInteractionHub = document.getElementById('draft-interaction-hub');
    elements.p1DraftName = document.getElementById('p1-draft-name');
    elements.p2DraftName = document.getElementById('p2-draft-name');
    elements.p1DraftStatus = document.getElementById('p1-draft-status');
    elements.p2DraftStatus = document.getElementById('p2-draft-status');
    elements.draftPoolContainer = document.getElementById('draft-pool-container');
    elements.confirmSelectionId = document.getElementById('confirm-selection-id');
    elements.p1IdBans = document.getElementById('p1-id-bans');
    elements.p2IdBans = document.getElementById('p2-id-bans');
    elements.p1Picks = document.getElementById('p1-picks');
    elements.p2Picks = document.getElementById('p2-picks');
    elements.p1S2PicksContainer = document.getElementById('p1-s2-picks-container');
    elements.p2S2PicksContainer = document.getElementById('p2-s2-picks-container');
    elements.p1S2Picks = document.getElementById('p1-s2-picks');
    elements.p2S2Picks = document.getElementById('p2-s2-picks');
    elements.p1ReserveTime = document.getElementById('p1-reserve-time');
    elements.p2ReserveTime = document.getElementById('p2-reserve-time');

    // Completed View
    elements.finalBannedEgosList = document.getElementById('final-banned-egos-list');
    elements.restartDraft = document.getElementById('restart-draft');
    elements.finalP1Name = document.getElementById('final-p1-name');
    elements.finalP2Name = document.getElementById('final-p2-name');
    elements.finalP1Picks = document.getElementById('final-p1-picks');
    elements.finalP2Picks = document.getElementById('final-p2-picks');
    elements.finalP1Bans = document.getElementById('final-p1-bans');
    elements.finalP2Bans = document.getElementById('final-p2-bans');
    elements.finalP1S2PicksContainer = document.getElementById('final-p1-s2-picks-container');
    elements.finalP2S2PicksContainer = document.getElementById('final-p2-s2-picks-container');
    elements.finalP1S2Picks = document.getElementById('final-p1-s2-picks');
    elements.finalP2S2Picks = document.getElementById('final-p2-s2-picks');
    elements.viewToggleSwitch = document.getElementById('view-toggle-switch');
    elements.viewToggleLabel = document.getElementById('view-toggle-label');
    elements.finalRostersView = document.getElementById('final-rosters-view');
    elements.timelineView = document.getElementById('timeline-view');

    // Coin Flip Modal
    elements.coinFlipModal = document.getElementById('coin-flip-modal');
    elements.coinIcon = document.getElementById('coin-icon');
    elements.coinFlipStatus = document.getElementById('coin-flip-status');
    elements.turnChoiceButtons = document.getElementById('turn-choice-buttons');
    elements.goFirstBtn = document.getElementById('go-first-btn');
    elements.goSecondBtn = document.getElementById('go-second-btn');

    // Filter bars
    elements.globalFilterBarRoster = document.getElementById('global-filter-bar-roster');
    elements.globalFilterBarBuilder = document.getElementById('global-filter-bar-builder');
    elements.globalFilterBarDraft = document.getElementById('global-filter-bar-draft');

    // Timeline
    elements.timelineWrapper = document.getElementById('timeline-wrapper');
    elements.timelineRosterP1 = document.getElementById('timeline-roster-p1-grid');
    elements.timelineRosterP2 = document.getElementById('timeline-roster-p2-grid');
    elements.timelineRosterP1Name = document.getElementById('timeline-roster-p1-name');
    elements.timelineRosterP2Name = document.getElementById('timeline-roster-p2-name');

    // Analyzer
    elements.analyzerPage = document.getElementById('analyzer-page');
    elements.goToAnalyzer = document.getElementById('go-to-analyzer');
    elements.draftImportCode = document.getElementById('draft-import-code');
    elements.analyzeDraftBtn = document.getElementById('analyze-draft-btn');
    elements.exportDraftBtn = document.getElementById('export-draft-btn');
    elements.createLobbyMainBtn = document.getElementById('create-lobby-main');
    elements.joinLobbyMainBtn = document.getElementById('join-lobby-main');
    elements.lobbyCodeInputMain = document.getElementById('lobby-code-input-main');

    // Dynamic tooltip element (created/destroyed on demand)
    elements.idTooltip = null;

    const optionalElements = ['idTooltip'];
    const missingElements = Object.keys(elements)
        .filter(key => !elements[key] && !optionalElements.includes(key));
    if (missingElements.length > 0) {
        console.warn('Missing DOM elements:', missingElements);
    }
    console.log('DOM elements cached successfully. Missing count:', missingElements.length);
}

export function setupEventListeners() {
    // Main Page
    elements.goToBuilder.addEventListener('click', () => {
        state.builderSelectedSinner = 'Yi Sang';
        switchView('rosterBuilderPage');
        renderRosterBuilder();
    });
    elements.showRulesBtn.addEventListener('click', () => elements.rulesModal.classList.remove('hidden'));
    elements.closeRulesBtn.addEventListener('click', () => elements.rulesModal.classList.add('hidden'));

    // Lobby code click-to-copy
    elements.lobbyCodeDisplay.addEventListener('click', async () => {
        const originalText = elements.lobbyCodeDisplay.textContent;
        const flashCopied = () => {
            elements.lobbyCodeDisplay.textContent = 'COPIED!';
            elements.lobbyCodeDisplay.style.color = '#4CAF50';
            setTimeout(() => {
                elements.lobbyCodeDisplay.textContent = originalText;
                elements.lobbyCodeDisplay.style.color = '';
            }, 800);
        };
        try {
            await navigator.clipboard.writeText(state.lobbyCode);
            flashCopied();
        } catch (err) {
            const textArea = document.createElement('textarea');
            textArea.value = state.lobbyCode;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            flashCopied();
        }
    });

    elements.closeRoleModalBtn.addEventListener('click', () => elements.roleSelectionModal.classList.add('hidden'));
    elements.confirmJoinBtn.addEventListener('click', () => {
        const playerName = validateAndTrimInput(elements.playerNameInput.value, 'your name');
        if (!playerName) {
            elements.roleSelectionModal.classList.add('hidden');
            return;
        }
        if (state.joinTarget.lobbyCode && state.joinTarget.role) {
            sendMessage({
                type: 'joinLobby',
                lobbyCode: state.joinTarget.lobbyCode,
                role: state.joinTarget.role,
                name: playerName
            });
        }
    });

    const cancelRejoinAction = () => {
        if (rejoinTimeout) clearTimeout(rejoinTimeout);
        try {
            localStorage.removeItem('limbusDraftSession');
        } catch (error) {
            console.error('Failed to clear session storage:', error);
        }
        elements.rejoinOverlay.style.display = 'none';
        if (state.socket && state.socket.readyState !== WebSocket.CLOSED) {
            state.socket.close();
        }
        setTimeout(connectWebSocket, TIMING.WEBSOCKET_RETRY_DELAY);
        showNotification('Rejoin attempt cancelled.');
    };
    elements.cancelRejoinBtn.addEventListener('click', cancelRejoinAction);

    const clearSessionAndReload = () => {
        stopKeepAlive();
        try {
            localStorage.removeItem('limbusDraftSession');
        } catch (error) {
            console.error('Failed to clear session storage:', error);
        }
        window.location.reload();
    };
    elements.restartDraft.addEventListener('click', clearSessionAndReload);

    // Lobby Roster Controls
    ['p1', 'p2'].forEach(player => {
        elements[`${player}Random`].addEventListener('click', () =>
            validateUserPermission(state.userRole, player) &&
            sendMessage({ type: 'rosterRandomize', lobbyCode: state.lobbyCode, player })
        );
        elements[`${player}Clear`].addEventListener('click', () =>
            validateUserPermission(state.userRole, player) &&
            sendMessage({ type: 'rosterClear', lobbyCode: state.lobbyCode, player })
        );
        elements[`${player}Ready`].addEventListener('click', () => {
            if (validateUserPermission(state.userRole, player)) {
                if (!state.participants[player].ready && !validateRosterSize(state.roster[player], state.draft.rosterSize, 'ready up')) {
                    return;
                }
                sendMessage({ type: 'updateReady', lobbyCode: state.lobbyCode, player });
            }
        });
        elements[`${player}RosterLoad`].addEventListener('click', () => {
            if (validateUserPermission(state.userRole, player)) {
                const code = elements[`${player}RosterCodeInput`].value.trim();
                const roster = validateRosterCodeSize(code, state.draft.rosterSize);
                if (roster) {
                    setPlayerRoster(player, roster);
                    showNotification('Roster loaded successfully!');
                }
            }
        });
    });

    // Roster Builder Controls
    elements.builderRosterSizeSelector.addEventListener('click', (e) => {
        const button = e.target.closest('button');
        if (button && button.dataset.size) {
            const newSize = parseInt(button.dataset.size, 10);
            if (newSize !== state.builderRosterSize) {
                state.builderRosterSize = newSize;
                state.builderRoster = [];
                elements.builderRosterSizeSelector.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                renderRosterBuilder();
                setupAdvancedRandomUI();
            }
        }
    });
    elements.builderRandom.addEventListener('click', () => {
        const shuffled = [...state.builderMasterIDList].sort(() => 0.5 - Math.random());
        state.builderRoster = shuffled.slice(0, state.builderRosterSize).map(id => id.id);
        renderRosterBuilder();
    });
    elements.builderClear.addEventListener('click', () => {
        state.builderRoster = [];
        renderRosterBuilder();
    });
    elements.builderCopyCode.addEventListener('click', () => {
        const code = elements.builderRosterCodeDisplay.textContent;
        if (!navigator.clipboard) {
            showNotification('Clipboard not supported. Please copy manually.', true);
            return;
        }
        navigator.clipboard.writeText(code).then(() => {
            showNotification('Roster code copied to clipboard!');
        }).catch((error) => {
            console.error('Clipboard write failed:', error);
            showNotification('Failed to copy code. Please copy manually.', true);
        });
    });
    elements.builderLoadCode.addEventListener('click', () => {
        const code = validateAndTrimInput(elements.builderLoadCodeInput.value, 'roster code');
        if (code) {
            const roster = loadRosterFromCode(code);
            if (roster) {
                state.builderRoster = roster;
                state.builderRosterSize = roster.length;
                elements.builderRosterSizeSelector.querySelectorAll('button').forEach(btn => {
                    btn.classList.toggle('active', parseInt(btn.dataset.size) === state.builderRosterSize);
                });
                renderRosterBuilder();
                setupAdvancedRandomUI();
                showNotification(`Roster for ${roster.length} IDs loaded successfully!`);
            }
        }
    });
    elements.toggleAdvancedRandom.addEventListener('click', () => {
        elements.advancedRandomOptions.classList.toggle('hidden');
    });
    elements.builderAdvancedRandom.addEventListener('click', generateAdvancedRandomRoster);

    // EGO Search with debouncing
    const debouncedRenderEgoBanPhase = createDebounceFunction(renderEgoBanPhase, 300);
    elements.egoSearchInput.addEventListener('input', (e) => {
        state.egoSearch = e.target.value;
        debouncedRenderEgoBanPhase();
    });

    // Korean Language Toggle
    if (elements.koreanToggle) {
        elements.koreanToggle.checked = state.koreanMode;
        elements.koreanToggle.addEventListener('change', (e) => {
            state.koreanMode = e.target.checked;
            saveKoreanModeToStorage(state.koreanMode);
            if (state.currentView === 'draftPhase' && state.draft.phase === 'egoBan') {
                renderEgoBanPhase();
            }
            renderBannedEgosDisplay();
            if (state.currentView === 'completedView') {
                renderCompletedView();
            }
            if (state.currentView === 'draftPhase') {
                updateDraftInstructions();
            }
            showNotification(`EGO names switched to ${state.koreanMode ? 'Korean' : 'English'}`);
        });
    }

    // Draft Controls
    elements.startCoinFlip.addEventListener('click', () => sendMessage({ type: 'startCoinFlip', lobbyCode: state.lobbyCode }));
    elements.goFirstBtn.addEventListener('click', () => sendMessage({ type: 'setTurnOrder', lobbyCode: state.lobbyCode, choice: 'first' }));
    elements.goSecondBtn.addEventListener('click', () => sendMessage({ type: 'setTurnOrder', lobbyCode: state.lobbyCode, choice: 'second' }));
    elements.confirmEgoBans.addEventListener('click', () => sendMessage({ type: 'draftControl', lobbyCode: state.lobbyCode, action: 'confirmEgoBans' }));
    elements.completeDraft.addEventListener('click', () => sendMessage({ type: 'draftControl', lobbyCode: state.lobbyCode, action: 'complete' }));
    elements.confirmSelectionId.addEventListener('click', () => confirmDraftAction('id'));
    elements.confirmSelectionEgo.addEventListener('click', () => confirmDraftAction('ego'));
    elements.refTimerControl.addEventListener('click', () => sendMessage({ type: 'timerControl', lobbyCode: state.lobbyCode, action: 'togglePause' }));

    // Hide/show lobby code
    elements.toggleCodeVisibility.addEventListener('click', () => {
        const codeDisplay = elements.lobbyCodeDisplay;
        const icon = elements.toggleCodeVisibility.querySelector('i');
        codeDisplay.classList.toggle('hidden');
        if (codeDisplay.classList.contains('hidden')) {
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        } else {
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }
    });

    elements.globalBackToMain.addEventListener('click', clearSessionAndReload);

    // Timeline Toggle
    elements.viewToggleSwitch.addEventListener('change', (e) => {
        const isTimelineView = e.target.checked;
        elements.finalRostersView.classList.toggle('hidden', isTimelineView);
        elements.timelineWrapper.classList.toggle('hidden', !isTimelineView);
        elements.viewToggleLabel.textContent = isTimelineView ? 'View Final Rosters' : 'View Timeline';
    });

    // Universal Tooltip Logic
    let tooltipTimer = null;

    function getTooltipData(element) {
        const idSlug = element.dataset.id;
        let data = state.masterIDList.find(id => id.id === idSlug);
        if (data) return { name: data.name };
        data = state.masterEGOList && state.masterEGOList.find(ego => ego.id === idSlug);
        if (data) return { name: data.name };
        return { name: element.textContent || '' };
    }

    const showTooltip = (element) => {
        if (getTooltipElement()) return;
        const tooltipData = getTooltipData(element);
        if (!tooltipData || !tooltipData.name) return;
        const tooltip = document.createElement('div');
        tooltip.id = 'id-tooltip';
        tooltip.textContent = tooltipData.name;
        tooltip.style.position = 'fixed';
        tooltip.style.top = '-9999px';
        tooltip.style.left = '-9999px';
        tooltip.style.opacity = '0';
        document.body.appendChild(tooltip);
        elements.idTooltip = tooltip;
        requestAnimationFrame(() => {
            const rect = element.getBoundingClientRect();
            const tooltipRect = tooltip.getBoundingClientRect();
            const margin = 8;
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            let top = rect.top - tooltipRect.height - 8;
            let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
            if (top < margin) top = rect.bottom + 8;
            if (top + tooltipRect.height > viewportHeight - margin && rect.top - tooltipRect.height - 8 >= margin) {
                top = rect.top - tooltipRect.height - 8;
            }
            left = Math.max(margin, Math.min(left, viewportWidth - tooltipRect.width - margin));
            top = Math.max(margin, Math.min(top, viewportHeight - tooltipRect.height - margin));
            tooltip.style.top = `${top}px`;
            tooltip.style.left = `${left}px`;
            tooltip.style.opacity = '1';
        });
    };

    const hideTooltip = () => {
        clearTimeout(tooltipTimer);
        const tooltip = getTooltipElement();
        if (tooltip) {
            tooltip.remove();
            elements.idTooltip = null;
        }
    };

    document.body.addEventListener('mouseover', (e) => {
        const targetElement = e.target.closest('.id-item, .ego-item');
        if (targetElement) {
            clearTimeout(tooltipTimer);
            tooltipTimer = setTimeout(() => showTooltip(targetElement), TIMING.TOOLTIP_SHOW_DELAY);
        }
    });
    document.body.addEventListener('mouseout', (e) => {
        const targetElement = e.target.closest('.id-item, .ego-item');
        if (targetElement) hideTooltip();
    });
    window.addEventListener('scroll', hideTooltip, true);

    // Analyzer
    elements.goToAnalyzer.addEventListener('click', () => switchView('analyzerPage'));

    // Main menu create/join buttons
    elements.createLobbyMainBtn.addEventListener('click', () => {
        const playerName = validateAndTrimInput(elements.playerNameInput.value, 'your name');
        if (!playerName) return;
        const options = {
            name: playerName,
            draftLogic: elements.draftLogicSelect.value,
            matchType: elements.matchTypeSelect.value,
            timerEnabled: elements.timerToggle.value === 'true',
            rosterSize: elements.rosterSizeSelect.value
        };
        sendMessage({ type: 'createLobby', options });
    });
    elements.joinLobbyMainBtn.addEventListener('click', () => {
        const playerName = validateAndTrimInput(elements.playerNameInput.value, 'your name');
        if (!playerName) return;
        const lobbyCode = validateAndTrimInput(elements.lobbyCodeInputMain.value, 'lobby code');
        if (lobbyCode) {
            sendMessage({ type: 'getLobbyInfo', lobbyCode: lobbyCode.toUpperCase() });
        }
    });

    // Export draft
    elements.exportDraftBtn.addEventListener('click', () => {
        try {
            const draftData = {
                participants: {
                    p1: { name: state.participants.p1.name },
                    p2: { name: state.participants.p2.name }
                },
                roster: state.roster,
                draft: state.draft
            };
            const exportCode = btoa(JSON.stringify(draftData));
            navigator.clipboard.writeText(exportCode).then(() => {
                showNotification('Draft export code copied to clipboard!');
            }).catch(err => {
                console.error('Failed to copy export code:', err);
                showNotification('Failed to copy. Please copy the code manually from the console.', true);
                console.log('EXPORT CODE:', exportCode);
            });
        } catch (error) {
            console.error('Error exporting draft:', error);
            showNotification('Could not generate export code.', true);
        }
    });

    // Analyze draft
    elements.analyzeDraftBtn.addEventListener('click', () => {
        const importCode = elements.draftImportCode.value.trim();
        if (!importCode) {
            showNotification('Please paste an export code.', true);
            return;
        }
        try {
            const importedData = JSON.parse(atob(importCode));
            if (!importedData.participants || !importedData.roster || !importedData.draft) {
                throw new Error('Invalid or corrupted draft data.');
            }
            state.participants.p1.name = importedData.participants.p1.name;
            state.participants.p2.name = importedData.participants.p2.name;
            state.roster = importedData.roster;
            state.draft = importedData.draft;
            switchView('completedView');
            renderCompletedView();
            showNotification('Draft analysis loaded successfully!');
        } catch (error) {
            console.error('Error analyzing draft code:', error);
            showNotification('Invalid or corrupted export code. Could not load draft.', true);
        }
    });
}
