// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Store connected clients
const connectedClients = new Set();

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);
  connectedClients.add(socket.id);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    connectedClients.delete(socket.id);
  });
});

// API endpoint to receive stack frame data
app.post('/api/stackframes', (req, res) => {
  const stackFrameData = req.body;
  
  // Validate the incoming data
  if (!stackFrameData || !stackFrameData.sequence || !Array.isArray(stackFrameData.sequence)) {
    return res.status(400).json({ error: 'Invalid stack frame data' });
  }
  
  console.log('Received stack frame data:', stackFrameData);
  
  // Broadcast to all connected clients
  io.emit('newStackFrame', stackFrameData);
  console.log(`Emitted newStackFrame event to ${connectedClients.size} clients`);
  
  res.status(200).json({ message: 'Stack frame data received and broadcast' });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});