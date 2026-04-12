const { createGameState } = require('./GameState');
const { generateRoomCode, generatePlayerId } = require('./utils');

// In-memory room registry
const rooms = new Map(); // roomCode -> { state, playerSocketMap }

function createRoom(socketId, playerName) {
  const code     = generateRoomCode();
  const playerId = generatePlayerId();

  rooms.set(code, {
    playerSocketMap: { [socketId]: playerId },
    lobbyPlayers: [{ id: playerId, name: playerName, socketId }],
    state: null, // set when game starts
  });

  return { roomCode: code, playerId };
}

function joinRoom(roomCode, socketId, playerName) {
  const room = rooms.get(roomCode);
  if (!room) return { error: 'Room not found' };
  if (room.state) return { error: 'Game already in progress' };
  if (room.lobbyPlayers.length >= 5) return { error: 'Room is full (max 5 players)' };
  if (room.lobbyPlayers.some(p => p.name.toLowerCase() === playerName.toLowerCase())) {
    return { error: 'Name already taken in this room' };
  }

  const playerId = generatePlayerId();
  room.playerSocketMap[socketId] = playerId;
  room.lobbyPlayers.push({ id: playerId, name: playerName, socketId });

  return {
    playerId,
    players: room.lobbyPlayers,
    hostId:  room.lobbyPlayers[0].id,
  };
}

function startGame(roomCode, socketId) {
  const room = rooms.get(roomCode);
  if (!room) return { error: 'Room not found' };

  const hostPlayerId = room.playerSocketMap[socketId];
  if (hostPlayerId !== room.lobbyPlayers[0].id) return { error: 'Only the host can start the game' };
  if (room.lobbyPlayers.length < 2) return { error: 'Need at least 2 players to start' };
  if (room.state) return { error: 'Game already started' };

  room.state = createGameState(roomCode, room.lobbyPlayers);
  return { state: room.state };
}

function getRoom(roomCode) {
  return rooms.get(roomCode);
}

function getRoomBySocket(socketId) {
  for (const [code, room] of rooms.entries()) {
    if (room.playerSocketMap[socketId] !== undefined) {
      return { roomCode: code, room };
    }
  }
  return null;
}

function getPlayerIdBySocket(roomCode, socketId) {
  const room = rooms.get(roomCode);
  return room?.playerSocketMap[socketId];
}

function handleDisconnect(socketId) {
  const found = getRoomBySocket(socketId);
  if (!found) return null;

  const { roomCode, room } = found;
  const playerId = room.playerSocketMap[socketId];

  if (!room.state) {
    // Still in lobby — remove player
    room.lobbyPlayers = room.lobbyPlayers.filter(p => p.id !== playerId);
    delete room.playerSocketMap[socketId];

    if (room.lobbyPlayers.length === 0) {
      rooms.delete(roomCode);
      return { roomCode, removed: true };
    }
    return { roomCode, players: room.lobbyPlayers, hostId: room.lobbyPlayers[0].id };
  }

  // Mark player as disconnected in game state (keep them in game, just mark socket)
  if (room.state.players[playerId]) {
    room.state.players[playerId].socketId = null;
  }

  return { roomCode, playerId, disconnected: true };
}

function handleReconnect(socketId, roomCode, playerName) {
  const room = rooms.get(roomCode);
  if (!room || !room.state) return { error: 'Room/game not found' };

  // Find player by name
  const player = Object.values(room.state.players).find(
    p => p.name.toLowerCase() === playerName.toLowerCase()
  );
  if (!player) return { error: 'Player not found in this game' };

  // Update socket mapping
  const oldSocket = Object.keys(room.playerSocketMap).find(
    sid => room.playerSocketMap[sid] === player.id
  );
  if (oldSocket) delete room.playerSocketMap[oldSocket];

  room.playerSocketMap[socketId] = player.id;
  player.socketId = socketId;

  return { playerId: player.id, state: room.state };
}

function cleanupStaleRooms() {
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    if (room.state?.lastActivity && now - room.state.lastActivity > TWO_HOURS) {
      rooms.delete(code);
    }
  }
}

// Run cleanup every 30 minutes
setInterval(cleanupStaleRooms, 30 * 60 * 1000);

module.exports = {
  createRoom,
  joinRoom,
  startGame,
  getRoom,
  getRoomBySocket,
  getPlayerIdBySocket,
  handleDisconnect,
  handleReconnect,
};
