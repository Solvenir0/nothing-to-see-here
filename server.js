// =================================================================================
// FILE: server.js
// DESCRIPTION: Thin entry point. All logic lives in server/ submodules.
// =================================================================================
const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');
const crypto = require('crypto');

const { init: initManager } = require('./server/lobby/manager');
const { init: initRouter, startCleanupJob } = require('./server/handlers/router');

const app = express();
const server = http.createServer(app);

app.disable('x-powered-by');
app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.get('/_ah/health', (req, res) => res.status(200).send('OK'));

const wss = new WebSocket.Server({ server });
initManager(wss, WebSocket);
initRouter(wss, crypto);
startCleanupJob();

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => require('./server/utils/logger').logInfo('SERVER', `Server started and listening on port ${PORT}`));

server.on('error', (err) => {
    require('./server/utils/logger').logError('SERVER', `Failed to start: ${err.message}`, err);
    process.exit(1);
});

