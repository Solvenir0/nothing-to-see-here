// server/utils/rateLimit.js
// Simple in-memory rate limiting for lobby creation

const rateLimit = {};
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // Max 10 lobby creations per minute per IP

module.exports = { rateLimit, RATE_LIMIT_WINDOW, RATE_LIMIT_MAX_REQUESTS };
