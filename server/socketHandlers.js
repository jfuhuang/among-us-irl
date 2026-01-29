const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

// Store active game rooms and player states
const gameRooms = new Map();
const playerStates = new Map();

/**
 * Authenticate socket connection using JWT token
 */
function authenticateSocket(socket, next) {
  const token = socket.handshake.auth.token;
  
  if (!token) {
    return next(new Error('Authentication required'));
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.userId = decoded.sub;
    socket.username = decoded.username;
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
}

/**
 * Handle player joining a game room
 */
function handleJoinRoom(io, socket, { roomId, playerData }) {
  // Leave any existing rooms
  const rooms = Array.from(socket.rooms).filter(r => r !== socket.id);
  rooms.forEach(room => {
    socket.leave(room);
    if (gameRooms.has(room)) {
      const roomData = gameRooms.get(room);
      roomData.players.delete(socket.userId);
      io.to(room).emit('playerLeft', { userId: socket.userId, username: socket.username });
    }
  });

  // Join new room
  socket.join(roomId);
  
  // Initialize room if it doesn't exist
  if (!gameRooms.has(roomId)) {
    gameRooms.set(roomId, {
      id: roomId,
      players: new Map(),
      state: 'waiting', // waiting, playing, finished
      createdAt: Date.now()
    });
  }

  const room = gameRooms.get(roomId);
  room.players.set(socket.userId, {
    userId: socket.userId,
    username: socket.username,
    socketId: socket.id,
    ...playerData
  });

  // Notify room about new player
  io.to(roomId).emit('playerJoined', {
    userId: socket.userId,
    username: socket.username,
    playerData
  });

  // Send current room state to the joining player
  socket.emit('roomState', {
    roomId,
    players: Array.from(room.players.values()),
    state: room.state
  });
}

/**
 * Handle player leaving a game room
 */
function handleLeaveRoom(io, socket, { roomId }) {
  socket.leave(roomId);
  
  if (gameRooms.has(roomId)) {
    const room = gameRooms.get(roomId);
    room.players.delete(socket.userId);
    
    // Notify other players
    io.to(roomId).emit('playerLeft', {
      userId: socket.userId,
      username: socket.username
    });
    
    // Clean up empty rooms
    if (room.players.size === 0) {
      gameRooms.delete(roomId);
    }
  }
}

/**
 * Handle player location updates
 */
function handleLocationUpdate(io, socket, { roomId, location }) {
  if (!location || typeof location.latitude !== 'number' || typeof location.longitude !== 'number') {
    return socket.emit('error', { message: 'Invalid location data' });
  }

  // Update player state
  playerStates.set(socket.userId, {
    ...playerStates.get(socket.userId),
    location,
    lastUpdate: Date.now()
  });

  // Broadcast to room (except sender)
  socket.to(roomId).emit('playerLocationUpdate', {
    userId: socket.userId,
    username: socket.username,
    location
  });
}

/**
 * Handle game state updates
 */
function handleGameStateUpdate(io, socket, { roomId, gameState }) {
  if (!gameRooms.has(roomId)) {
    return socket.emit('error', { message: 'Room not found' });
  }

  const room = gameRooms.get(roomId);
  room.state = gameState.state || room.state;
  
  // Broadcast game state to all players in room
  io.to(roomId).emit('gameStateUpdate', gameState);
}

/**
 * Handle client disconnection
 */
function handleDisconnect(io, socket) {
  console.log(`Client disconnected: ${socket.id} (User: ${socket.username})`);
  
  // Remove from all rooms
  const rooms = Array.from(socket.rooms).filter(r => r !== socket.id);
  rooms.forEach(roomId => {
    if (gameRooms.has(roomId)) {
      const room = gameRooms.get(roomId);
      room.players.delete(socket.userId);
      
      io.to(roomId).emit('playerLeft', {
        userId: socket.userId,
        username: socket.username
      });
      
      if (room.players.size === 0) {
        gameRooms.delete(roomId);
      }
    }
  });
  
  // Clean up player state
  playerStates.delete(socket.userId);
}

/**
 * Initialize Socket.IO handlers
 */
function initializeSocketHandlers(io) {
  // Add authentication middleware
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id} (User: ${socket.username})`);

    // Handle room events
    socket.on('joinRoom', (data) => handleJoinRoom(io, socket, data));
    socket.on('leaveRoom', (data) => handleLeaveRoom(io, socket, data));
    
    // Handle location updates
    socket.on('updateLocation', (data) => handleLocationUpdate(io, socket, data));
    
    // Handle game state updates
    socket.on('updateGameState', (data) => handleGameStateUpdate(io, socket, data));

    // Handle disconnection
    socket.on('disconnect', () => handleDisconnect(io, socket));
  });
}

module.exports = { initializeSocketHandlers, gameRooms, playerStates };
