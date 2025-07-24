// =================================================================================
// FILE: server.js
// DESCRIPTION: Main entry point for the backend. Sets up the Express and
//              WebSocket server, and handles incoming connections and messages
//              by routing them to appropriate modules.
// =================================================================================
const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');
const { initializeData } = require('./server_data');
const lobbyManager = require('./lobbyManager');
const { handleWebSocketMessage } = require('./websocketHandler');

// --- INITIALIZATION ---
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Load game data and lobbies from disk
const gameData = initializeData();
lobbyManager.loadLobbiesFromDisk();

// --- MIDDLEWARE & ROUTES ---
app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.get('/_ah/health', (req, res) => res.status(200).send('OK'));

// --- WEBSOCKET CONNECTION HANDLING ---
wss.on('connection', (ws) => {
    console.log('Client connected');

    // Send initial data packet to the newly connected client
    ws.send(JSON.stringify({
        type: 'initialData',
        payload: {
            gameData,
            config: lobbyManager.getConfigForClient()
        }
    }));

    ws.on('message', (message) => {
        try {
            const incomingData = JSON.parse(message);
            // Delegate message handling to the websocketHandler module
            handleWebSocketMessage(ws, incomingData, wss);
        } catch (error) {
            console.error('Invalid JSON received:', message, error);
            ws.send(JSON.stringify({ type: 'error', payload: { message: 'Invalid message format.' } }));
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        // Handle client disconnection logic (e.g., update participant status)
        lobbyManager.handleDisconnect(ws, wss);
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

// --- SERVER START ---
const PORT = lobbyManager.getConfig().PORT;
server.listen(PORT, () => console.log(`Server is listening on port ${PORT}`));
