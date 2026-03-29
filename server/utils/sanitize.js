// server/utils/sanitize.js
// Input sanitization utilities to prevent XSS attacks

function sanitize(text) {
    if (!text) return "";
    return text.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Enhanced player name sanitization with length limits and additional validation
function sanitizePlayerName(name) {
    if (!name || typeof name !== 'string') return "";

    // Trim whitespace and limit length to 16 characters
    const trimmed = name.trim().slice(0, 16);

    // Remove any control characters and excessive whitespace
    const cleaned = trimmed.replace(/[\x00-\x1F\x7F]/g, '').replace(/\s+/g, ' ');

    // Apply basic HTML sanitization
    return sanitize(cleaned);
}

module.exports = { sanitize, sanitizePlayerName };
