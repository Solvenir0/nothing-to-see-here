// client/js/rendering/draftMaker.js
// Draft Maker page rendering — unified step-sequence builder.
// State lives in state.draftMakerState; events are wired in draftMakerEvents.js.

import { state, elements } from '../state.js';
import { encodeDraftTemplate } from '../utils/draftCode.js';

const TYPE_LABELS  = { egoBan: 'EGO Ban', idBan: 'ID Ban', idPick: 'ID Pick' };
const TYPE_ICONS   = { egoBan: 'fa-eye-slash', idBan: 'fa-ban', idPick: 'fa-check-circle' };

// Preview toggle state (module-level, persists across re-renders)
let _previewMode = false;
let _banSearch   = '';

export function setPreviewMode(val) { _previewMode = val; }
export function getPreviewMode()    { return _previewMode; }
export function setBanSearch(val) {
    _banSearch = val;
    const resultsEl = document.getElementById('dm-ban-results');
    if (resultsEl) resultsEl.innerHTML = renderBanResults(state.draftMakerState.bannedIds);
}

export function renderDraftMaker() {
    const builder = elements.draftMakerBuilder;
    if (!builder) return;

    const t     = state.draftMakerState;
    const steps = t.steps;
    const stats = computeStats(steps);

    builder.innerHTML = `
        <div class="dm-section">
            <h3>Roster Size</h3>
            <div class="dm-inline">
                <input type="number" id="dm-roster-size" class="dm-input dm-input-short" min="1" max="200" value="${t.rosterSize}">
                <span class="dm-hint">IDs per player</span>
            </div>
        </div>

        ${renderBannedSection(t.bannedIds)}

        ${renderTimerSection(t)}

        <div class="dm-section">
            <div class="dm-section-header">
                <h3>Draft Sequence</h3>
                <button id="dm-preview-toggle" class="btn btn-small ${_previewMode ? 'btn-primary' : 'btn-secondary'}" title="Toggle visual preview">
                    <i class="fas fa-${_previewMode ? 'list' : 'eye'}"></i>
                    ${_previewMode ? 'Edit' : 'Preview'}
                </button>
            </div>
            <div class="dm-stats dm-hint">
                EGO bans — P1: <strong>${stats.egoBan.p1}</strong> &nbsp; P2: <strong>${stats.egoBan.p2}</strong>
                &emsp;|&emsp;
                ID bans — P1: <strong>${stats.idBan.p1}</strong> &nbsp; P2: <strong>${stats.idBan.p2}</strong>
                &emsp;|&emsp;
                ID picks — P1: <strong>${stats.idPick.p1}</strong> &nbsp; P2: <strong>${stats.idPick.p2}</strong>
            </div>
            ${_previewMode ? renderPreview(steps) : renderSteps(steps)}
            ${_previewMode ? '' : `
            <div class="dm-add-row">
                <button class="btn btn-secondary btn-small dm-add-step" data-player="p1" data-type="egoBan">+ EGO Ban</button>
                <button class="btn btn-secondary btn-small dm-add-step" data-player="p1" data-type="idBan">+ ID Ban</button>
                <button class="btn btn-secondary btn-small dm-add-step" data-player="p1" data-type="idPick">+ ID Pick</button>
            </div>`}
        </div>
    `;

    updateDraftCode();
}

// --- Edit view ---
function renderSteps(steps) {
    if (!steps || steps.length === 0) {
        return '<p class="dm-empty-msg">No steps yet. Add steps below.</p>';
    }
    return `<div class="dm-steps">${steps.map((s, i) => `
        <div class="dm-step" data-idx="${i}">
            <span class="dm-step-num">${i + 1}.</span>
            <select class="dm-player-select" data-idx="${i}">
                <option value="p1" ${s.p === 'p1' ? 'selected' : ''}>Player 1</option>
                <option value="p2" ${s.p === 'p2' ? 'selected' : ''}>Player 2</option>
            </select>
            <select class="dm-type-select" data-idx="${i}">
                <option value="egoBan" ${s.type === 'egoBan' ? 'selected' : ''}>EGO Ban</option>
                <option value="idBan"  ${s.type === 'idBan'  ? 'selected' : ''}>ID Ban</option>
                <option value="idPick" ${s.type === 'idPick' ? 'selected' : ''}>ID Pick</option>
            </select>
            <input type="number" class="dm-count-input dm-input-short" min="1" max="99" value="${s.c}" data-idx="${i}">
            <span class="dm-step-label">${s.c === 1 ? TYPE_LABELS[s.type] : TYPE_LABELS[s.type] + 's'}</span>
            <button class="btn btn-small dm-move-up" data-idx="${i}" title="Move up" ${i === 0 ? 'disabled' : ''}><i class="fas fa-chevron-up"></i></button>
            <button class="btn btn-small dm-move-down" data-idx="${i}" title="Move down" ${i === steps.length - 1 ? 'disabled' : ''}><i class="fas fa-chevron-down"></i></button>
            <button class="btn btn-small dm-remove-step" data-idx="${i}" title="Remove step"><i class="fas fa-times"></i></button>
        </div>
    `).join('')}</div>`;
}

// --- Preview view ---
function renderPreview(steps) {
    if (!steps || steps.length === 0) {
        return '<p class="dm-empty-msg">No steps yet.</p>';
    }

    // Build one chip per individual action (expand c > 1)
    const chips = [];
    steps.forEach((s, stepIdx) => {
        for (let n = 0; n < s.c; n++) {
            chips.push({ p: s.p, type: s.type, stepIdx, nth: n + 1, total: s.c });
        }
    });

    const p1Chips = chips.map((ch, i) => ch.p === 'p1'
        ? renderChip(ch, i + 1)
        : `<div class="dm-preview-gap"></div>`
    ).join('');

    const p2Chips = chips.map((ch, i) => ch.p === 'p2'
        ? renderChip(ch, i + 1)
        : `<div class="dm-preview-gap"></div>`
    ).join('');

    return `
        <div class="dm-preview">
            <div class="dm-preview-lane">
                <div class="dm-preview-lane-label p1-label">P1</div>
                <div class="dm-preview-chips">${p1Chips}</div>
            </div>
            <div class="dm-preview-connector-row">
                ${chips.map((ch, i) =>
                    `<div class="dm-preview-num">${i + 1}</div>`
                ).join('')}
            </div>
            <div class="dm-preview-lane">
                <div class="dm-preview-lane-label p2-label">P2</div>
                <div class="dm-preview-chips">${p2Chips}</div>
            </div>
        </div>
        <div class="dm-preview-legend">
            <span class="dm-legend-item"><span class="dm-chip-dot type-egoBan"></span>EGO Ban</span>
            <span class="dm-legend-item"><span class="dm-chip-dot type-idBan"></span>ID Ban</span>
            <span class="dm-legend-item"><span class="dm-chip-dot type-idPick"></span>ID Pick</span>
        </div>
    `;
}

function renderChip(ch, turn) {
    const label = ch.total > 1 ? `${ch.nth}/${ch.total}` : '';
    return `<div class="dm-preview-chip type-${ch.type}" title="Step ${ch.stepIdx + 1}: ${TYPE_LABELS[ch.type]}${ch.total > 1 ? ` (${ch.nth} of ${ch.total})` : ''}">
        <i class="fas ${TYPE_ICONS[ch.type]}"></i>
        ${label ? `<span class="dm-chip-sub">${label}</span>` : ''}
    </div>`;
}

// --- Banned IDs section ---
function renderTimerSection(t) {
    const ts = t.timerSettings || {};
    const enabled = t.timerEnabled;
    return `
        <div class="dm-section">
            <div class="dm-section-header">
                <h3>Timer Settings</h3>
                <label class="dm-toggle-label">
                    <input type="checkbox" id="dm-timer-enabled" ${enabled ? 'checked' : ''}>
                    <span>${enabled ? 'Enabled' : 'Disabled'}</span>
                </label>
            </div>
            <div class="dm-timer-fields ${enabled ? '' : 'dm-timer-fields--hidden'}">
                <div class="dm-timer-grid">
                    <div class="dm-timer-field">
                        <label for="dm-timer-ego-ban">EGO Ban</label>
                        <div class="dm-inline">
                            <input type="number" id="dm-timer-ego-ban" class="dm-input dm-input-short" min="5" max="600" value="${ts.egoBanTime ?? 20}">
                            <span class="dm-hint">sec</span>
                        </div>
                    </div>
                    <div class="dm-timer-field">
                        <label for="dm-timer-id-ban">ID Ban</label>
                        <div class="dm-inline">
                            <input type="number" id="dm-timer-id-ban" class="dm-input dm-input-short" min="5" max="600" value="${ts.idBanTime ?? 30}">
                            <span class="dm-hint">sec</span>
                        </div>
                    </div>
                    <div class="dm-timer-field">
                        <label for="dm-timer-id-pick">ID Pick</label>
                        <div class="dm-inline">
                            <input type="number" id="dm-timer-id-pick" class="dm-input dm-input-short" min="5" max="600" value="${ts.idPickTime ?? 30}">
                            <span class="dm-hint">sec</span>
                        </div>
                    </div>
                    <div class="dm-timer-field">
                        <label for="dm-timer-reserve">Reserve Time</label>
                        <div class="dm-inline">
                            <input type="number" id="dm-timer-reserve" class="dm-input dm-input-short" min="0" max="3600" value="${ts.reserveTime ?? 120}">
                            <span class="dm-hint">sec per player</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderBannedSection(bannedIds) {
    const count = bannedIds ? bannedIds.length : 0;
    return `
        <div class="dm-section">
            <h3>Banned IDs${count > 0 ? ` <span class="dm-badge">${count}</span>` : ''}</h3>
            <p class="dm-hint">These identities cannot be included in any player's roster.</p>
            <div class="dm-banned-chips">${renderBannedChips(bannedIds)}</div>
            <input type="text" id="dm-ban-search" class="dm-input dm-ban-search" placeholder="Search identities to ban..." value="${_banSearch.replace(/"/g, '&quot;')}">
            <div class="dm-ban-results" id="dm-ban-results">${renderBanResults(bannedIds)}</div>
        </div>
    `;
}

function renderBannedChips(bannedIds) {
    if (!bannedIds || bannedIds.length === 0) {
        return '<p class="dm-hint dm-no-bans">No IDs banned yet.</p>';
    }
    return bannedIds.map(id => {
        const item = state.masterIDList.find(x => x.id === id);
        const name = item ? item.name : id;
        return `<span class="dm-ban-chip">
            <span class="dm-ban-chip-name">${name}</span>
            <button class="dm-ban-remove" data-slug="${id}" title="Remove ban"><i class="fas fa-times"></i></button>
        </span>`;
    }).join('');
}

function renderBanResults(bannedIds) {
    if (!_banSearch.trim()) {
        return '<p class="dm-hint">Type a name or sinner to search.</p>';
    }
    const query = _banSearch.toLowerCase();
    const bannedSet = new Set(bannedIds || []);
    const results = (state.builderMasterIDList || state.masterIDList)
        .filter(item => !bannedSet.has(item.id))
        .filter(item =>
            item.name.toLowerCase().includes(query) ||
            item.sinner.toLowerCase().includes(query)
        )
        .slice(0, 25);
    if (results.length === 0) {
        return '<p class="dm-hint">No matching identities found.</p>';
    }
    return results.map(item => `
        <button class="dm-ban-result-item dm-ban-add" data-slug="${item.id}" title="Ban: ${item.name}">
            <img src="/uploads/identity/${item.imageFile}" alt="" loading="lazy" onerror="this.style.display='none'">
            <span>${item.name}</span>
            <i class="fas fa-plus"></i>
        </button>
    `).join('');
}

export function updateDraftCode() {
    if (!elements.draftMakerCodeDisplay) return;
    const code = encodeDraftTemplate(state.draftMakerState);
    elements.draftMakerCodeDisplay.textContent = code || 'Add at least one step to generate a code.';
    if (elements.draftMakerCopyCode) {
        elements.draftMakerCopyCode.disabled = !code;
    }
}

function computeStats(steps) {
    const stats = {
        egoBan: { p1: 0, p2: 0 },
        idBan:  { p1: 0, p2: 0 },
        idPick: { p1: 0, p2: 0 },
    };
    for (const s of (steps || [])) {
        if (stats[s.type]) stats[s.type][s.p] += s.c;
    }
    return stats;
}
