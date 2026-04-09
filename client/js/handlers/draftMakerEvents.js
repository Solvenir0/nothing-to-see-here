// client/js/handlers/draftMakerEvents.js
// Event listeners for the Draft Maker page.
// Wired once at boot via setupDraftMakerListeners().

import { state, elements } from '../state.js';
import { showNotification } from '../utils/core.js';
import { validateAndTrimInput } from '../utils/validation.js';
import { savePlayerName } from '../utils/storage.js';
import { renderDraftMaker, updateDraftCode, setPreviewMode, getPreviewMode, setBanSearch } from '../rendering/draftMaker.js';
import { encodeDraftTemplate, decodeDraftTemplate } from '../utils/draftCode.js';
import { sendMessage } from './stateHandlers.js';
import { switchView } from '../rendering/navigation.js';

export function setupDraftMakerListeners() {
    elements.goToDraftMaker?.addEventListener('click', () => {
        switchView('draftMakerPage');
        renderDraftMaker();
    });

    const builder = elements.draftMakerBuilder;
    if (builder) {
        builder.addEventListener('change', onBuilderChange);
        builder.addEventListener('input',  onBuilderInput);
        builder.addEventListener('click',  onBuilderClick);
    }
    elements.draftMakerCopyCode?.addEventListener('click', () => {
        const code = elements.draftMakerCodeDisplay?.textContent;
        if (!code || elements.draftMakerCopyCode.disabled) return;
        navigator.clipboard.writeText(code)
            .then(() => showNotification('Draft template code copied!'))
            .catch(() => showNotification('Copy failed — please copy manually.', true));
    });

    elements.draftMakerLoadBtn?.addEventListener('click', loadTemplateFromInput);
    elements.draftMakerCreateLobby?.addEventListener('click', createLobbyFromTemplate);
}

// --- Delegated handlers ---

function onBuilderChange(e) {
    const t = e.target;
    const idx = parseInt(t.dataset.idx, 10);
    const steps = state.draftMakerState.steps;

    if (t.classList.contains('dm-player-select') && !isNaN(idx)) {
        steps[idx].p = t.value;
        renderDraftMaker();
        return;
    }
    if (t.classList.contains('dm-type-select') && !isNaN(idx)) {
        steps[idx].type = t.value;
        renderDraftMaker();
        return;
    }
    if (t.id === 'dm-roster-size') {
        state.draftMakerState.rosterSize = clamp(parseInt(t.value) || 1, 1, 200);
        updateDraftCode();
        return;
    }
    if (t.id === 'dm-timer-enabled') {
        state.draftMakerState.timerEnabled = t.checked;
        // Re-render to show/hide timer fields and update toggle label
        renderDraftMaker();
        return;
    }
}

function onBuilderInput(e) {
    const t = e.target;
    const idx = parseInt(t.dataset.idx, 10);
    if (t.classList.contains('dm-count-input') && !isNaN(idx)) {
        const steps = state.draftMakerState.steps;
        steps[idx].c = clamp(parseInt(t.value) || 1, 1, 99);
        updateDraftCode();
    }
    if (t.id === 'dm-ban-search') {
        setBanSearch(t.value);
    }
    const timerFieldMap = {
        'dm-timer-ego-ban': 'egoBanTime',
        'dm-timer-id-ban':  'idBanTime',
        'dm-timer-id-pick': 'idPickTime',
        'dm-timer-reserve': 'reserveTime',
    };
    if (timerFieldMap[t.id]) {
        const ts = state.draftMakerState.timerSettings;
        const key = timerFieldMap[t.id];
        const min = key === 'reserveTime' ? 0 : 5;
        const max = key === 'reserveTime' ? 3600 : 600;
        ts[key] = clamp(parseInt(t.value) || min, min, max);
        updateDraftCode();
    }
}

function onBuilderClick(e) {
    // Preview toggle
    if (e.target.closest('#dm-preview-toggle')) {
        setPreviewMode(!getPreviewMode());
        renderDraftMaker();
        return;
    }

    // Add banned ID
    const addBan = e.target.closest('.dm-ban-add');
    if (addBan) {
        const slug = addBan.dataset.slug;
        const bannedIds = state.draftMakerState.bannedIds;
        if (slug && !bannedIds.includes(slug)) {
            bannedIds.push(slug);
            renderDraftMaker();
        }
        return;
    }

    // Remove banned ID
    const removeBan = e.target.closest('.dm-ban-remove');
    if (removeBan) {
        const slug = removeBan.dataset.slug;
        state.draftMakerState.bannedIds = state.draftMakerState.bannedIds.filter(b => b !== slug);
        renderDraftMaker();
        return;
    }

    // Add step
    const addBtn = e.target.closest('.dm-add-step');
    if (addBtn) {
        const steps = state.draftMakerState.steps;
        const lastP = steps.length > 0 ? steps[steps.length - 1].p : 'p1';
        steps.push({
            p:    addBtn.dataset.player || (lastP === 'p1' ? 'p2' : 'p1'),
            type: addBtn.dataset.type || 'idPick',
            c:    1,
        });
        renderDraftMaker();
        // Scroll the new step into view
        const lastStep = elements.draftMakerBuilder.querySelector('.dm-step:last-child');
        lastStep?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
    }

    // Remove step
    const rmBtn = e.target.closest('.dm-remove-step');
    if (rmBtn) {
        const idx = parseInt(rmBtn.dataset.idx, 10);
        state.draftMakerState.steps.splice(idx, 1);
        renderDraftMaker();
        return;
    }

    // Move up
    const upBtn = e.target.closest('.dm-move-up');
    if (upBtn) {
        const idx = parseInt(upBtn.dataset.idx, 10);
        if (idx > 0) {
            const steps = state.draftMakerState.steps;
            [steps[idx - 1], steps[idx]] = [steps[idx], steps[idx - 1]];
            renderDraftMaker();
        }
        return;
    }

    // Move down
    const downBtn = e.target.closest('.dm-move-down');
    if (downBtn) {
        const idx = parseInt(downBtn.dataset.idx, 10);
        const steps = state.draftMakerState.steps;
        if (idx < steps.length - 1) {
            [steps[idx], steps[idx + 1]] = [steps[idx + 1], steps[idx]];
            renderDraftMaker();
        }
        return;
    }
}

function loadTemplateFromInput() {
    const raw = elements.draftMakerLoadInput?.value.trim();
    if (!raw) { showNotification('Please enter a code.', true); return; }
    const template = decodeDraftTemplate(raw);
    if (!template) { showNotification('Invalid or unsupported draft template code.', true); return; }
    state.draftMakerState = {
        rosterSize:    template.rosterSize,
        steps:         template.steps,
        bannedIds:     template.bannedIds || [],
        timerEnabled:  template.timerEnabled || false,
        timerSettings: template.timerSettings || { egoBanTime: 20, idBanTime: 30, idPickTime: 30, reserveTime: 120 },
    };
    renderDraftMaker();
    showNotification('Template loaded!');
}

function createLobbyFromTemplate() {
    const name = validateAndTrimInput(elements.draftMakerName?.value || '', 'your name');
    if (!name) return;
    savePlayerName(name);

    const t = state.draftMakerState;
    if (!t.steps || t.steps.length === 0) {
        showNotification('Add at least one step before creating a lobby.', true);
        return;
    }

    const code = encodeDraftTemplate(t);
    if (!code) {
        showNotification('Template encoding failed. Check your steps.', true);
        return;
    }

    sendMessage({
        type: 'createLobby',
        options: {
            name,
            timerEnabled:  t.timerEnabled || false,
            timerSettings: t.timerSettings || { egoBanTime: 20, idBanTime: 30, idPickTime: 30, reserveTime: 120 },
            customTemplate: { rosterSize: t.rosterSize, steps: t.steps, bannedIds: t.bannedIds || [] },
        },
    });
}

function clamp(val, min, max) {
    return Math.min(max, Math.max(min, val));
}
