// client/js/rendering/egoElements.js
// EGO element creation and banned EGO display.

import { state, elements } from '../state.js';
import { koreanEgoNames, koreanSinnerNames } from '../../../data.js';

function getKoreanMaps() {
    return { egoNames: koreanEgoNames, sinnerNames: koreanSinnerNames };
}

export function getEgoDisplayName(egoData) {
    if (!state.koreanMode) {
        return egoData.name;
    }

    const fullName = egoData.name;
    const sinnerMatch = fullName.match(/^(.+?)\s*\(([^)]+)\)$/);

    if (sinnerMatch) {
        const egoNameOnly = sinnerMatch[1].trim();
        const sinnerName = sinnerMatch[2];
        const { egoNames, sinnerNames } = getKoreanMaps();
        const koreanEgoName = egoNames[egoNameOnly] || egoNameOnly;
        const koreanSinnerName = sinnerNames[sinnerName] || sinnerName;
        return `${koreanEgoName} (${koreanSinnerName})`;
    }

    return egoData.name;
}

export function createEgoElement(egoData, options = {}) {
    const { clickHandler, isHovered } = options;
    const egoElement = document.createElement('div');
    const allBans = [...state.draft.egoBans.p1, ...state.draft.egoBans.p2];
    const isBanned = allBans.includes(egoData.id);

    egoElement.className = 'ego-item';
    if (isBanned) egoElement.classList.add('banned');
    if (isHovered) egoElement.classList.add('hovered');

    egoElement.dataset.id = egoData.id;
    egoElement.style.borderLeftColor = egoData.cssColor;

    const displayName = getEgoDisplayName(egoData);
    egoElement.innerHTML = `
        <div class="ego-header"><span class="ego-rarity">${egoData.rarity}</span></div>
        <div class="ego-name">${displayName}</div>`;

    if (clickHandler && !isBanned) {
        egoElement.addEventListener('click', () => clickHandler(egoData.id));
    }
    return egoElement;
}

export function renderBannedEgosDisplay() {
    const allBans = [...state.draft.egoBans.p1, ...state.draft.egoBans.p2];
    const bannedEgoObjects = allBans.map(id => state.masterEGOList.find(ego => ego.id === id)).filter(Boolean);

    const renderList = (container) => {
        container.innerHTML = '';
        bannedEgoObjects.forEach(ego => {
            const item = document.createElement('div');
            item.className = 'banned-ego-item';
            item.style.backgroundColor = ego.cssColor;
            const displayName = getEgoDisplayName(ego);
            item.innerHTML = `<span class="rarity">[${ego.rarity}]</span> <span class="name">${displayName}</span>`;
            container.appendChild(item);
        });
    };

    renderList(elements.draftBannedEgosList);
    renderList(elements.finalBannedEgosList);
}
