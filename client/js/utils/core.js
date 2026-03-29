// client/js/utils/core.js
// Shared UI helpers and DOM element cache accessors.

import { TIMING } from '../config.js';
import { elements } from '../state.js';

export function showNotification(text, isError = false) {
    elements.notification.textContent = text;
    elements.notification.style.background = isError ? 'var(--disconnected)' : 'var(--primary)';
    elements.notification.classList.add('show');
    setTimeout(() => { elements.notification.classList.remove('show'); }, TIMING.NOTIFICATION_HIDE_DELAY);
}

export function showSideChangeNotification(oldRole, newRole) {
    const oldSide = oldRole === 'p1' ? 'LEFT' : 'RIGHT';
    const newSide = newRole === 'p1' ? 'LEFT' : 'RIGHT';
    const message = `Position Changed! You are now on the ${newSide} side (was ${oldSide})`;
    elements.notification.innerHTML = `<i class="fas fa-exchange-alt"></i> ${message}`;
    elements.notification.style.background = 'var(--warning)';
    elements.notification.style.fontWeight = 'bold';
    elements.notification.classList.add('show');
    setTimeout(() => {
        elements.notification.classList.remove('show');
        elements.notification.style.fontWeight = '';
    }, TIMING.CONNECTION_ERROR_DELAY);
}

export function createSlug(name) {
    if (!name) return '';
    let slug = name.toLowerCase();
    slug = slug.replace(/ryōshū/g, 'ryshu').replace(/öufi/g, 'ufi');
    slug = slug.replace(/e\.g\.o::/g, 'ego-');
    slug = slug.replace(/ & /g, ' ').replace(/[.'"]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/[^\w-]+/g, '');
    return slug;
}

// Dynamic DOM element cache helpers (used by rendering modules)
export function getReserveTimeElement(role) {
    const elementKey = `${role}ReserveTime`;
    if (!elements[elementKey]) {
        elements[elementKey] = document.getElementById(`${role}-reserve-time`);
    }
    return elements[elementKey];
}

export function getSliderElements(sinner) {
    const cacheKey = `sliders_${sinner.replace(/\s+/g, '_')}`;
    if (!elements[cacheKey]) {
        elements[cacheKey] = {
            minSlider: document.getElementById(`slider-${sinner}-min`),
            maxSlider: document.getElementById(`slider-${sinner}-max`),
            minVal: document.getElementById(`slider-val-${sinner}-min`),
            maxVal: document.getElementById(`slider-val-${sinner}-max`)
        };
    }
    return elements[cacheKey];
}

export function getTooltipElement() {
    if (!elements.idTooltip) {
        elements.idTooltip = document.getElementById('id-tooltip');
    }
    return elements.idTooltip;
}

export function clearDynamicElementCache() {
    elements.idTooltip = null;
    Object.keys(elements).forEach(key => {
        if (key.startsWith('sliders_')) {
            delete elements[key];
        }
    });
}
