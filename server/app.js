const express = require('express'); // Import Express
const http = require('http'); // Import HTTP module for Socket.IO
const { Server } = require('socket.io'); // Import Socket.IO
const app = express(); // Create an Express application instance
const server = http.createServer(app); // Create HTTP server
const io = new Server(server, {
  cors: {
    origin: '*', // Allow all origins for development
    methods: ['GET', 'POST']
  }
});
const port = 3000; // Define the port number
const userRoutes = require('./routes/userRoutes');
const { initializeSocketHandlers } = require('./socketHandlers');

app.use(express.json());
app.use('/api/users', userRoutes);

app.get('/', (req, res) => {
  res.send('Hello World!');
});

// Initialize Socket.IO handlers
initializeSocketHandlers(io);

async function start() {
  try {
    await require('./dbInit')(); // Initialize the DB.
    server.listen(port, () => {
      console.log(`Server listening on port ${port}`);
      console.log(`Socket.IO server ready`);
    });
  } catch (err) {
    console.error('Failed to initialize DB', err);
    process.exit(1);
  }
}

start();
