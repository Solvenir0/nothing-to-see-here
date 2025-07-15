const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');

// --- Basic Server Setup ---
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// --- FIX: Serve static files from the "public" folder ---
// This is the key change to make your index.html visible
app.use(express.static(path.join(__dirname, 'public')));

// --- Your Original Draft State and Logic ---
let cards = [];
let users = [];
let picks = [];
let currentPlayerIndex = 0;
let round = 1;
let nextUserId = 0;

// Load card data from CSV
fs.createReadStream('cards.csv')
    .pipe(csv())
    .on('data', (data) => cards.push(data))
    .on('end', () => {
        console.log('Cards loaded successfully.');
    });

// Function to broadcast data to all connected clients
function broadcast(data) {
    const jsonData = JSON.stringify(data);
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(jsonData);
        }
    });
}

// Function to send the full draft state to everyone
function broadcastDraftState() {
    const draftState = {
        users: users,
        picks: picks,
        currentPlayerIndex: currentPlayerIndex,
        round: round,
        cards: cards // It's often better to send cards once, but this works
    };
    broadcast(draftState);
}

// --- WebSocket Connection Handling ---
wss.on('connection', (ws) => {
    console.log('Client connected.');

    // Assign a unique ID to the new user and add them to the list
    const userId = nextUserId++;
    const newUser = { id: userId, name: `Player ${userId + 1}` };
    users.push(newUser);
    ws.userId = userId; // Associate the ID with this specific connection

    // Send the new user their assigned ID
    ws.send(JSON.stringify({ type: 'ASSIGN_USER_ID', userId: userId }));

    // Send the complete current state to everyone
    broadcastDraftState();

    // Handle incoming messages from this client
    ws.on('message', (message) => {
        const data = JSON.parse(message);

        // Only handle 'pick' messages
        if (data.type === 'pick' && users[currentPlayerIndex]?.id === ws.userId) {
            const pick = {
                cardId: data.cardId,
                userId: ws.userId,
                round: round,
                pickNumber: picks.length + 1
            };
            picks.push(pick);

            // Move to the next player
            currentPlayerIndex++;
            if (currentPlayerIndex >= users.length) {
                currentPlayerIndex = 0;
                round++;
            }

            // Broadcast the new state to all clients
            broadcastDraftState();
        }
    });

    // Handle client disconnection
    ws.on('close', () => {
        console.log('Client disconnected.');
        // Remove the user from the list
        users = users.filter(user => user.id !== ws.userId);
        // If the disconnected user was the current player, move to the next
        if (currentPlayerIndex >= users.length) {
            currentPlayerIndex = 0;
        }
        // Broadcast the updated state
        broadcastDraftState();
    });
});

// --- Start the Server ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
