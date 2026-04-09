// client/js/rendering/idElements.js
// ID/EGO data parsing, ID element creation, and list rendering.

import { SINNER_ORDER } from '../config.js';
import { state } from '../state.js';
import { createSlug } from '../utils/core.js';

// Parse identities from data/identities.json (array of plain objects).
export function parseIdentityData(jsonArray) {
    return jsonArray.map(entry => {
        const sinnerMatch = entry.name.match(/(Yi Sang|Faust|Don Quixote|Ryōshū|Meursault|Hong Lu|Heathcliff|Ishmael|Rodion|Sinclair|Outis|Gregor)/);
        return {
            id: createSlug(entry.name),
            name: entry.name,
            keywords: entry.keywords || [],
            sinAffinities: entry.sinAffinities || [],
            rarity: entry.rarity,
            imageFile: `${createSlug(entry.name)}.webp`,
            sinner: sinnerMatch ? sinnerMatch[0] : 'Unknown',
        };
    });
}

const sinColorMap = {
    'Sloth':    'var(--sin-sloth-bg)',
    'Gloom':    'var(--sin-gloom-bg)',
    'Wrath':    'var(--sin-wrath-bg)',
    'Pride':    'var(--sin-pride-bg)',
    'Envy':     'var(--sin-envy-bg)',
    'Lust':     'var(--sin-lust-bg)',
    'Gluttony': 'var(--sin-gluttony-bg)',
};

// Parse EGOs from data/egos.json (array of plain objects).
export function parseEGOData(jsonArray) {
    return jsonArray.map(entry => ({
        id: createSlug(`${entry.name} ${entry.sinner}`),
        name: `${entry.name} (${entry.sinner})`,
        egoName: entry.name,
        sinner: entry.sinner,
        rarity: entry.rarity,
        sin: entry.sin,
        imageFile: `${createSlug(`${entry.name}-${entry.sinner}`)}.webp`,
        cssColor: sinColorMap[entry.sin] || 'rgba(128, 128, 128, 0.7)',
    }));
}

export function sortIdsByMasterList(idList) {
    if (!Array.isArray(idList)) return [];
    return idList.slice().sort((a, b) => {
        const indexA = state.masterIDList.findIndex(item => item.id === a);
        const indexB = state.masterIDList.findIndex(item => item.id === b);
        return indexA - indexB;
    });
}

export function createIdElement(idData, options = {}) {
    const { isSelected, isHovered, clickHandler, isNotInRoster, isShared, isBanned } = options;
    const idElement = document.createElement('div');
    idElement.className = `id-item rarity-${idData.rarity}`;
    if (isSelected) idElement.classList.add('selected');
    if (isHovered) idElement.classList.add('hovered');
    if (isBanned)  idElement.classList.add('banned');

    idElement.dataset.id = idData.id;

    const img = document.createElement('img');
    img.className = 'id-icon';
    img.src = `/uploads/identity/${idData.imageFile}`;
    img.alt = idData.name;
    idElement.appendChild(img);

    const nameDiv = document.createElement('div');
    nameDiv.className = 'id-name';
    nameDiv.textContent = idData.name;
    idElement.appendChild(nameDiv);

    if (isShared) {
        const sharedDiv = document.createElement('div');
        sharedDiv.className = 'shared-icon';
        sharedDiv.innerHTML = '<i class="fas fa-link"></i>';
        idElement.appendChild(sharedDiv);
    }

    if (clickHandler && !isBanned) {
        idElement.addEventListener('click', () => clickHandler(idData.id));
    }
    return idElement;
}

export function renderIDList(container, idObjectList, options = {}) {
    const { selectionSet, clickHandler, hoverId, notInRosterSet, sharedIdSet, bannedSet } = options;
    container.innerHTML = '';
    if (!container.classList.contains('compact-id-list')) {
        container.className = 'roster-selection';
    }
    if (!Array.isArray(idObjectList) || idObjectList.length === 0) {
        if (!container.classList.contains('compact-id-list')) {
            container.innerHTML = '<div class="empty-roster" style="padding: 10px; text-align: center;">No items to display</div>';
        }
        return;
    }

    const fragment = document.createDocumentFragment();
    idObjectList.forEach(idData => {
        if (!idData) return;
        const isSelected = selectionSet ? selectionSet.includes(idData.id) : false;
        const isHovered = hoverId ? hoverId === idData.id : false;
        const isNotInRoster = notInRosterSet ? !notInRosterSet.includes(idData.id) : false;
        const isShared = sharedIdSet ? sharedIdSet.includes(idData.id) : false;
        const isBanned = bannedSet ? bannedSet.has(idData.id) : false;
        const element = createIdElement(idData, {
            isSelected,
            isHovered,
            isNotInRoster,
            isShared,
            isBanned,
            clickHandler: clickHandler ? () => clickHandler(idData.id) : null
        });
        fragment.appendChild(element);
    });
    container.appendChild(fragment);
}

export function renderGroupedView(container, idObjectList, options = {}) {
    const { clickHandler, selectionSet, hoverId, notInRosterSet, sharedIdSet } = options;

    container.innerHTML = '';
    container.className = 'sinner-grouped-roster';

    if (!Array.isArray(idObjectList) || idObjectList.length === 0) {
        container.innerHTML = '<div class="empty-roster" style="padding: 10px; text-align: center;">No items to display.</div>';
        return;
    }

    const groupedBySinner = {};
    idObjectList.forEach(id => {
        if (!id) return;
        if (!groupedBySinner[id.sinner]) groupedBySinner[id.sinner] = [];
        groupedBySinner[id.sinner].push(id);
    });

    const fragment = document.createDocumentFragment();
    let isFirstRenderedGroup = true;

    SINNER_ORDER.forEach(sinnerName => {
        if (groupedBySinner[sinnerName] && groupedBySinner[sinnerName].length > 0) {
            const sinnerRow = document.createElement('div');
            sinnerRow.className = 'sinner-row';

            if (!isFirstRenderedGroup) {
                const sinnerHeader = document.createElement('div');
                sinnerHeader.className = 'sinner-header';
                sinnerRow.appendChild(sinnerHeader);
            }
            isFirstRenderedGroup = false;

            const idContainer = document.createElement('div');
            idContainer.className = 'sinner-id-container';

            const sortedIds = groupedBySinner[sinnerName].sort((a, b) => {
                const indexA = state.masterIDList.findIndex(item => item.id === a.id);
                const indexB = state.masterIDList.findIndex(item => item.id === b.id);
                return indexA - indexB;
            });

            sortedIds.forEach(idData => {
                const isSelected = selectionSet ? selectionSet.includes(idData.id) : false;
                const isHovered = hoverId ? hoverId === idData.id : false;
                const isNotInRoster = notInRosterSet ? !notInRosterSet.includes(idData.id) : false;
                const isShared = sharedIdSet ? sharedIdSet.includes(idData.id) : false;
                const idElement = createIdElement(idData, { isSelected, isHovered, isNotInRoster, isShared, clickHandler });
                idContainer.appendChild(idElement);
            });
            sinnerRow.appendChild(idContainer);
            fragment.appendChild(sinnerRow);
        }
    });

    container.appendChild(fragment);
}

export function filterIDs(sourceList, filterObject, options = {}) {
    const { draftPhase = false, builderPhase = false } = options;
    const searchTerm = filterObject.rosterSearch.toLowerCase();

    return sourceList.filter(fullData => {
        if (!fullData) return false;

        const isLcb = fullData.name.toLowerCase().includes('lcb sinner');
        if (builderPhase && isLcb) return false;
        if (draftPhase && (fullData.rarity === '0' || isLcb)) return false;

        if (filterObject.sinner && fullData.sinner !== filterObject.sinner) return false;
        if (filterObject.sinAffinity && !fullData.sinAffinities.includes(filterObject.sinAffinity)) return false;
        if (filterObject.keyword && !fullData.keywords.includes(filterObject.keyword)) return false;
        if (searchTerm && !fullData.name.toLowerCase().includes(searchTerm)) return false;
        return true;
    });
}
