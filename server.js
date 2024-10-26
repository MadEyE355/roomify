const express = require('express');
const { createServer } = require('http');
const { join } = require('path');
const { Server } = require('socket.io');

const app = express();
const server = createServer(app);
const io = new Server(server);

app.use(express.json());

// In-memory room storage
const rooms = {};
const chatHistory = {}; // Object to store chat history for each room

// Serve static files
app.get('/', (req, res) => {
    res.sendFile(join(__dirname, 'index.html'));
});

app.get('/rooms', (req, res) => {
    res.sendFile(join(__dirname, 'rooms.html'));
});

// API to get all rooms
app.get('/api/rooms', (req, res) => {
    res.json(rooms);
});

// API to create a new room
app.post('/api/create-room', (req, res) => {
    const { roomName } = req.body;
    const roomId = `room_${Object.keys(rooms).length + 1}`; // Unique ID for room
    rooms[roomId] = { name: roomName };
    chatHistory[roomId] = []; // Initialize chat history for the new room
    res.json({ roomId, roomName });
});

// Dynamic route for each room
app.get('/chat/:roomId', (req, res) => {
    const roomId = req.params.roomId;
    if (rooms[roomId]) {
        res.sendFile(join(__dirname, 'chat.html')); // Load a separate chat interface
    } else {
        res.status(404).send('Room not found');
    }
});

// Socket.IO connection
io.on('connection', (socket) => {
    socket.on('joinRoom', ({ roomId, userName }) => {
        socket.join(roomId);
        socket.to(roomId).emit('message', `${userName} has joined the room.`);
        
        // Send chat history to the newly joined user
        if (chatHistory[roomId]) {
            chatHistory[roomId].forEach(msg => {
                socket.emit('message', msg); // Emit each message to the new user
            });
        }

        // Listen for chat messages and broadcast to the same room
        socket.on('chatMessage', (msg) => {
            const message = `${userName}: ${msg}`;
            chatHistory[roomId].push(message); // Store the message in chat history
            io.to(roomId).emit('message', message); // Emit the message to all users in the room
        });
    });
});

server.listen(3000, () => {
    console.log('Server running at http://localhost:3000');
});
