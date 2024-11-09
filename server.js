const express = require('express');
const { createServer } = require('http');
const { join } = require('path');
const { Server } = require('socket.io');

const app = express();
const server = createServer(app);
const io = new Server(server);

app.use(express.json());

const { MongoClient } = require('mongodb');
const uri = "mongodb://localhost:27017/"; // replace with your actual connection string
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

async function connectDB() {
    try {
        await client.connect();
        console.log("Connected to MongoDB");
    } catch (error) {
        console.error("MongoDB connection error:", error);
    }
}

connectDB();

const db = client.db("rproto");
const roomsCollection = db.collection("rooms");
const chatsCollection = db.collection("chats");

// Save a new room to the database
async function saveRoom(roomName) {
    const result = await roomsCollection.insertOne({ name: roomName });
    return result;
}

// Get all rooms from the database
async function getRooms() {
    const rooms = await roomsCollection.find().toArray();
    return rooms;
}

// Save a message to the database
async function saveMessage(roomName, userName, message) {
    await chatsCollection.insertOne({
        roomName: roomName,
        userName: userName,
        message: message,
        timestamp: new Date()
    });
}

// Get messages for a specific room from MongoDB
async function getMessages(roomId) {
    const messages = await chatsCollection.find({ roomName: roomId }).sort({ timestamp: 1 }).toArray();
    return messages;
}

// Serve static files
app.get('/', (req, res) => {
    res.sendFile(join(__dirname, 'index.html'));
});

app.get('/rooms', (req, res) => {
    res.sendFile(join(__dirname, 'rooms.html'));
});

// API to get all rooms from the database
app.get('/api/rooms', async (req, res) => {
    try {
        const rooms = await getRooms();
        res.json(rooms);
    } catch (err) {
        res.status(500).json({ error: "Error fetching rooms" });
    }
});

// API to create a new room and save it to the database
app.post('/api/create-room', async (req, res) => {
    const { roomName } = req.body;

    if (!roomName) {
        return res.status(400).json({ error: "Room name is required" });
    }

    try {
        // Save the room to the database
        const result = await saveRoom(roomName);
        const roomId = result.insertedId.toString(); // MongoDB generates a unique _id for each room
        console.log(`Room created: ${roomName} with ID: ${roomId}`);

        res.json({ roomId, roomName });
    } catch (err) {
        console.error("Error saving room:", err);
        res.status(500).json({ error: "Failed to create room" });
    }
});

// Dynamic route for each room
app.get('/chat/:roomId', (req, res) => {
    const roomId = req.params.roomId;
    res.sendFile(join(__dirname, 'chat.html')); // Load a separate chat interface
});

// Socket.IO connection
io.on('connection', (socket) => {
    socket.on('joinRoom', async ({ roomId, userName }) => {
        socket.join(roomId);
        socket.to(roomId).emit('message', `${userName} has joined the room.`);

        // Log user joining
        console.log(`${userName} joined room: ${roomId}`);

        try {
            // Fetch chat history for the room from MongoDB
            const messages = await getMessages(roomId);
            // Send chat history to the newly joined user
            messages.forEach(msg => {
                socket.emit('message', `${msg.userName}: ${msg.message}`); // Emit each message to the new user
            });
        } catch (err) {
            console.error("Error fetching chat history:", err);
        }

        // Listen for chat messages and broadcast to the same room
        socket.on('chatMessage', (msg) => {
            const message = `${userName}: ${msg}`;
            io.to(roomId).emit('message', message); // Emit the message to all users in the room

            // Save the message to MongoDB
            saveMessage(roomId, userName, msg);

            // Log the message sent
            console.log(`Message from ${userName} in room ${roomId}: ${msg}`);
        });
    });
});

server.listen(3000, () => {
    console.log('Server running at http://localhost:3000');
});
