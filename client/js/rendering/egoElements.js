// client/js/rendering/egoElements.js
// EGO element creation and banned EGO display.

import { state, elements } from '../state.js';

export function getEgoDisplayName(egoData) {
    if (state.koreanMode && egoData.koreanName) {
        return egoData.koreanName;
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

    const imgTag = egoData.imageFile
        ? `<img class="ego-icon" src="/uploads/ego/${egoData.imageFile}" alt="${egoData.egoName}" onerror="this.style.display='none'">`
        : '';
    egoElement.innerHTML = `
        ${imgTag}
        <div class="ego-header"><span class="ego-rarity">${egoData.rarity}</span></div>
        <div class="ego-name">${egoData.name}</div>`;

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
            item.innerHTML = `<span class="rarity">[${ego.rarity}]</span> <span class="name">${ego.name}</span>`;
            container.appendChild(item);
        });
    };

    renderList(elements.draftBannedEgosList);
    renderList(elements.finalBannedEgosList);
}
