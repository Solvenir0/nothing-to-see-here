// client/js/rendering/rosterBuilder.js
// Roster builder page rendering and advanced random generation.

import { SINNER_ORDER, GAME_CONFIG } from '../config.js';
import { state, elements } from '../state.js';
import { filterIDs, renderIDList, renderGroupedView } from './idElements.js';
import { getSliderElements, clearDynamicElementCache, showNotification } from '../utils/core.js';
import { generateRosterCode } from '../utils/storage.js';

// toggleBuilderIdSelection is injected from handlers/actions.js to avoid circular deps
let _toggleBuilderIdSelection = null;

export function init(toggleBuilderIdSelection) {
    _toggleBuilderIdSelection = toggleBuilderIdSelection;
}

export function renderRosterBuilder() {
    const sinnerNav = elements.builderSinnerNav;
    sinnerNav.innerHTML = '';

    SINNER_ORDER.forEach(sinnerName => {
        const btn = document.createElement('button');
        btn.className = 'btn sinner-nav-btn';
        btn.textContent = sinnerName;
        if (sinnerName === state.builderSelectedSinner) {
            btn.classList.add('selected');
        }
        btn.addEventListener('click', () => {
            state.builderSelectedSinner = sinnerName;
            renderRosterBuilder();
        });
        sinnerNav.appendChild(btn);
    });

    const sinnerIDs = state.idsBySinner[state.builderSelectedSinner];
    const filteredSinnerIDs = filterIDs(sinnerIDs, state.filters, { builderPhase: true });
    renderIDList(elements.builderIdPool, filteredSinnerIDs, {
        selectionSet: state.builderRoster,
        clickHandler: _toggleBuilderIdSelection
    });

    const sortedSelectedRoster = [...state.builderRoster].sort((a, b) => {
        const indexA = state.masterIDList.findIndex(item => item.id === a);
        const indexB = state.masterIDList.findIndex(item => item.id === b);
        return indexA - indexB;
    });
    const selectedObjects = sortedSelectedRoster.map(id => state.masterIDList.find(item => item.id === id)).filter(Boolean);

    renderGroupedView(elements.builderSelectedRoster, selectedObjects, {
        selectionSet: state.builderRoster,
        clickHandler: _toggleBuilderIdSelection
    });

    elements.builderCounter.textContent = state.builderRoster.length;
    elements.builderRosterSize.textContent = state.builderRosterSize;

    if (state.builderRoster.length === state.builderRosterSize) {
        const code = generateRosterCode();
        elements.builderRosterCodeDisplay.textContent = code || 'Error generating code.';
        elements.builderCopyCode.disabled = !code;
    } else {
        elements.builderRosterCodeDisplay.textContent = `Select ${state.builderRosterSize - state.builderRoster.length} more IDs to generate a code.`;
        elements.builderCopyCode.disabled = true;
    }
}

export function setupAdvancedRandomUI() {
    const container = elements.sinnerSlidersContainer;
    container.innerHTML = '';
    clearDynamicElementCache();
    const rosterSize = state.builderRosterSize;

    const updateTotals = () => {
        let totalMin = 0, totalMax = 0;
        SINNER_ORDER.forEach(sinner => {
            const sliders = getSliderElements(sinner);
            totalMin += parseInt(sliders.minSlider?.value || 0, 10);
            totalMax += parseInt(sliders.maxSlider?.value || 0, 10);
        });
        elements.totalMinDisplay.textContent = totalMin;
        elements.totalMaxDisplay.textContent = totalMax;
        elements.advancedRandomRosterSize.forEach(el => el.textContent = rosterSize);
        const possible = totalMin <= rosterSize && totalMax >= rosterSize;
        elements.builderAdvancedRandom.disabled = !possible;
        elements.advancedRandomSummary.style.color = possible ? 'var(--text)' : 'var(--primary)';
    };

    SINNER_ORDER.forEach(sinner => {
        const group = document.createElement('div');
        group.className = 'sinner-slider-group';
        const maxIDs = state.idsBySinner[sinner]?.length || 0;

        group.innerHTML = `
            <label>${sinner}</label>
            <div class="slider-container">
                <div class="slider-row">
                    <span>Min</span>
                    <input type="range" id="slider-${sinner}-min" min="0" max="${maxIDs}" value="0">
                    <span class="slider-value" id="slider-val-${sinner}-min">0</span>
                </div>
                <div class="slider-row">
                    <span>Max</span>
                    <input type="range" id="slider-${sinner}-max" min="0" max="${maxIDs}" value="${maxIDs}">
                    <span class="slider-value" id="slider-val-${sinner}-max">${maxIDs}</span>
                </div>
            </div>
        `;
        container.appendChild(group);

        const sliders = getSliderElements(sinner);
        const { minSlider, maxSlider, minVal, maxVal } = sliders;

        minSlider.addEventListener('input', () => {
            minVal.textContent = minSlider.value;
            if (parseInt(minSlider.value) > parseInt(maxSlider.value)) {
                maxSlider.value = minSlider.value;
                maxVal.textContent = maxSlider.value;
            }
            updateTotals();
        });
        maxSlider.addEventListener('input', () => {
            maxVal.textContent = maxSlider.value;
            if (parseInt(maxSlider.value) < parseInt(minSlider.value)) {
                minSlider.value = maxSlider.value;
                minVal.textContent = minSlider.value;
            }
            updateTotals();
        });
    });
    updateTotals();
}

export function generateAdvancedRandomRoster() {
    const constraints = {};
    let totalMin = 0;
    let totalMax = 0;
    const rosterSize = state.builderRosterSize;

    SINNER_ORDER.forEach(sinner => {
        const sliders = getSliderElements(sinner);
        const min = parseInt(sliders.minSlider?.value || 0, 10);
        const max = parseInt(sliders.maxSlider?.value || 0, 10);
        constraints[sinner] = { min, max, available: state.idsBySinner[sinner] || [] };
        totalMin += min;
        totalMax += max;
    });

    if (totalMin > rosterSize || totalMax < rosterSize) {
        showNotification(`Constraints are impossible. Total Min must be <= ${rosterSize} and Total Max must be >= ${rosterSize}.`, true);
        return;
    }

    let roster = [];
    let availableIDs = [...state.builderMasterIDList];

    for (const sinner in constraints) {
        const { min, available } = constraints[sinner];
        if (available.length < min) {
            showNotification(`Not enough IDs for ${sinner} to meet the minimum of ${min}.`, true);
            return;
        }
        const shuffled = [...available].sort(() => 0.5 - Math.random());
        roster.push(...shuffled.slice(0, min));
    }

    const rosterSlugs = new Set(roster.map(id => id.id));
    availableIDs = availableIDs.filter(id => !rosterSlugs.has(id.id));

    let attempts = 0;
    while (roster.length < rosterSize && attempts < GAME_CONFIG.MAX_GENERATION_ATTEMPTS) {
        if (availableIDs.length === 0) break;
        const randomIndex = Math.floor(Math.random() * availableIDs.length);
        const candidate = availableIDs[randomIndex];
        const sinnerCount = roster.filter(id => id.sinner === candidate.sinner).length;
        if (sinnerCount < constraints[candidate.sinner].max) {
            roster.push(candidate);
            rosterSlugs.add(candidate.id);
            availableIDs.splice(randomIndex, 1);
        }
        attempts++;
    }

    if (roster.length === rosterSize) {
        state.builderRoster = roster.map(id => id.id);
        renderRosterBuilder();
        showNotification('Advanced random roster generated!');
    } else {
        showNotification('Could not generate a valid roster with the given constraints. Try relaxing them.', true);
    }
}
