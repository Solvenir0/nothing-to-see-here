// client/js/rendering/idElements.js
// ID/EGO data parsing, ID element creation, and list rendering.

import { SINNER_ORDER } from '../config.js';
import { state } from '../state.js';
import { createSlug } from '../utils/core.js';

export function parseIDCSV(csv) {
    const lines = csv.split('\n').filter(line => line.trim() !== '');
    if (lines.length < 2) return [];
    const regex = /(".*?"|[^",]+)(?=\s*,|\s*$)/g;
    const headers = lines[0].split(',').map(h => h.trim());
    const result = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const values = line.match(regex) || [];
        if (values.length !== headers.length) continue;
        const obj = {};
        headers.forEach((header, idx) => {
            let value = values[idx].trim();
            if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
            obj[header] = value;
        });

        const name = obj.Name;
        const sinnerMatch = name.match(/(Yi Sang|Faust|Don Quixote|Ryōshū|Meursault|Hong Lu|Heathcliff|Ishmael|Rodion|Sinclair|Outis|Gregor)/);
        result.push({
            id: createSlug(name),
            name: name,
            keywords: obj.Keywords ? obj.Keywords.split(',').map(k => k.trim()) : [],
            sinAffinities: obj.SinAffinities ? obj.SinAffinities.split(',').map(s => s.trim()) : [],
            rarity: obj.Rarity,
            imageFile: `${createSlug(name)}.webp`,
            sinner: sinnerMatch ? sinnerMatch[0] : 'Unknown',
        });
    }
    return result;
}

export function parseEGOData(data) {
    const lines = data.trim().split('\n');
    const egoList = [];
    const bgColorMap = {
        'Yellow': 'var(--sin-sloth-bg)', 'Blue': 'var(--sin-gloom-bg)', 'Red': 'var(--sin-wrath-bg)',
        'Indigo': 'var(--sin-pride-bg)', 'Purple': 'var(--sin-envy-bg)', 'Orange': 'var(--sin-lust-bg)',
        'Green': 'var(--sin-gluttony-bg)'
    };

    lines.forEach(line => {
        if (!line.includes(' - ')) return;
        const parts = line.split(' - ');
        if (parts.length < 4) return;

        const nameAndSinner = parts[0];
        const rarity = parts[1].trim();
        const sin = parts[2].trim();
        const color = parts[3].trim();

        let sinner = 'Unknown';
        let name = nameAndSinner;

        for (const s of SINNER_ORDER) {
            if (nameAndSinner.includes(s)) {
                sinner = s;
                name = nameAndSinner.replace(s, '').trim();
                break;
            }
        }

        egoList.push({
            id: createSlug(`${name} ${sinner}`),
            name: `${name} (${sinner})`,
            egoName: name,
            sinner, rarity, sin, color,
            cssColor: bgColorMap[color] || 'rgba(128, 128, 128, 0.7)'
        });
    });
    return egoList;
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
    const { isSelected, isHovered, clickHandler, isNotInRoster, isShared } = options;
    const idElement = document.createElement('div');
    idElement.className = `id-item rarity-${idData.rarity}`;
    if (isSelected) idElement.classList.add('selected');
    if (isHovered) idElement.classList.add('hovered');

    idElement.dataset.id = idData.id;
    let html = `<img class="id-icon" src="/uploads/${idData.imageFile}" alt="${idData.name}"><div class="id-name">${idData.name}</div>`;
    if (isShared) {
        html += '<div class="shared-icon"><i class="fas fa-link"></i></div>';
    }
    idElement.innerHTML = html;

    if (clickHandler) {
        idElement.addEventListener('click', () => clickHandler(idData.id));
    }
    return idElement;
}

export function renderIDList(container, idObjectList, options = {}) {
    const { selectionSet, clickHandler, hoverId, notInRosterSet, sharedIdSet } = options;
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
        const element = createIdElement(idData, {
            isSelected,
            isHovered,
            isNotInRoster,
            isShared,
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
