// server/utils/logger.js
// Enhanced logging utility with consistent formatting

function logInfo(category, message, data = null) {
    const timestamp = new Date().toISOString();
    const logMessage = data 
        ? `[${timestamp}] ${category}: ${message} ${JSON.stringify(data)}`
        : `[${timestamp}] ${category}: ${message}`;
    console.log(logMessage);
}

function logError(category, message, error = null) {
    const timestamp = new Date().toISOString();
    const logMessage = error 
        ? `[${timestamp}] ERROR ${category}: ${message} ${error}`
        : `[${timestamp}] ERROR ${category}: ${message}`;
    console.error(logMessage);
}

module.exports = { logInfo, logError };
