const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// Keep track of connected users and draft state
let users = [];
let draftState = {
    // ... initial draft state ...
};

wss.on('connection', (ws) => {
    // ... (Your existing WebSocket logic will be improved here) ...

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        // Handle different message types (e.g., user joining, making a pick)
        switch (data.type) {
            case 'USER_JOIN':
                // ... handle new user joining ...
                break;
            case 'MAKE_PICK':
                // ... handle a user making a draft pick ...
                break;
            // Add other cases as needed
        }

        // Broadcast the updated state to all clients
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(draftState));
            }
        });
    });

    ws.on('close', () => {
        // ... handle user disconnecting ...
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});
