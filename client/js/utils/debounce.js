// client/js/utils/debounce.js
// Generic debounce factory. No dependencies.

export function createDebounceFunction(func, delay) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
}
