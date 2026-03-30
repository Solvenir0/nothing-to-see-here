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

    if (egoData.imageFile) {
        const img = document.createElement('img');
        img.className = 'ego-icon';
        img.src = `/uploads/ego/${egoData.imageFile}`;
        img.alt = egoData.egoName;
        img.onerror = function() { this.style.display = 'none'; };
        egoElement.appendChild(img);
    }
    const header = document.createElement('div');
    header.className = 'ego-header';
    const raritySpan = document.createElement('span');
    raritySpan.className = 'ego-rarity';
    raritySpan.textContent = egoData.rarity;
    header.appendChild(raritySpan);
    egoElement.appendChild(header);
    const nameDiv = document.createElement('div');
    nameDiv.className = 'ego-name';
    nameDiv.textContent = egoData.name;
    egoElement.appendChild(nameDiv);

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
            item.style.borderColor = ego.cssColor;

            if (ego.imageFile) {
                const img = document.createElement('img');
                img.className = 'banned-ego-thumb';
                img.src = `/uploads/ego/${ego.imageFile}`;
                img.alt = ego.egoName;
                img.onerror = function() { this.style.display = 'none'; };
                item.appendChild(img);
            }

            const textDiv = document.createElement('div');
            textDiv.className = 'banned-ego-text';
            const raritySpan = document.createElement('span');
            raritySpan.className = 'rarity';
            raritySpan.textContent = `[${ego.rarity}]`;
            const nameSpan = document.createElement('span');
            nameSpan.className = 'name';
            nameSpan.textContent = ego.name;
            textDiv.appendChild(raritySpan);
            textDiv.appendChild(document.createTextNode(' '));
            textDiv.appendChild(nameSpan);
            item.appendChild(textDiv);
            container.appendChild(item);
        });
    };

    renderList(elements.draftBannedEgosList);
    renderList(elements.finalBannedEgosList);
}
