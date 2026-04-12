const crypto = require('crypto');

const db = require('./db');
const { createGameState } = require('./GameState');
const { generateRoomCode, generatePlayerId } = require('./utils');

const MAX_PLAYERS = 5;

const socketBindings = new Map(); // socketId -> { roomCode, playerId }
const playerSockets = new Map(); // `${roomCode}:${playerId}` -> socketId

function roomPlayerKey(roomCode, playerId) {
  return `${roomCode}:${playerId}`;
}

function createReconnectToken() {
  return crypto.randomBytes(24).toString('hex');
}

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function sanitizeLobbyPlayers(players = []) {
  return players.map((player) => ({
    id: player.id,
    name: player.name,
  }));
}

function sanitizeState(state) {
  if (!state) return null;

  const copy = cloneJson(state);
  for (const player of Object.values(copy.players || {})) {
    player.socketId = null;
  }

  return copy;
}

function hydrateRoom(row, sessions = []) {
  if (!row) return null;

  const sessionMap = new Map(sessions.map((session) => [session.player_id, session]));
  const lobbyPlayers = (row.lobby_players_json || []).map((player) => ({
    ...player,
    socketId: sessionMap.get(player.id)?.last_socket_id || null,
  }));

  const state = row.game_state_json ? cloneJson(row.game_state_json) : null;
  if (state?.players) {
    for (const [playerId, player] of Object.entries(state.players)) {
      player.socketId = sessionMap.get(playerId)?.last_socket_id || null;
    }
  }

  return {
    roomCode: row.room_code,
    hostPlayerId: row.host_player_id,
    status: row.status,
    lobbyPlayers,
    state,
    sessions: sessions.map((session) => ({
      playerId: session.player_id,
      roomCode: session.room_code,
      playerName: session.player_name,
      reconnectToken: session.reconnect_token,
      lastSocketId: session.last_socket_id,
      isActive: session.is_active,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
      lastSeenAt: session.last_seen_at,
    })),
    lastActivityAt: row.last_activity_at,
  };
}

function bindSocket(socketId, roomCode, playerId) {
  const previousSocket = playerSockets.get(roomPlayerKey(roomCode, playerId));
  if (previousSocket) {
    socketBindings.delete(previousSocket);
  }

  socketBindings.set(socketId, { roomCode, playerId });
  playerSockets.set(roomPlayerKey(roomCode, playerId), socketId);
}

function clearSocketBinding(socketId) {
  const binding = socketBindings.get(socketId);
  if (!binding) return null;

  socketBindings.delete(socketId);
  const key = roomPlayerKey(binding.roomCode, binding.playerId);
  if (playerSockets.get(key) === socketId) {
    playerSockets.delete(key);
  }

  return binding;
}

function getBindingBySocket(socketId) {
  return socketBindings.get(socketId) || null;
}

function getSocketIdForPlayer(roomCode, playerId) {
  return playerSockets.get(roomPlayerKey(roomCode, playerId)) || null;
}

async function fetchLockedRoom(client, roomCode) {
  const roomResult = await client.query(
    `SELECT *
     FROM rooms
     WHERE room_code = $1
     FOR UPDATE`,
    [roomCode]
  );

  if (roomResult.rowCount === 0) return null;

  const sessionsResult = await client.query(
    `SELECT *
     FROM player_sessions
     WHERE room_code = $1
     ORDER BY created_at ASC`,
    [roomCode]
  );

  return hydrateRoom(roomResult.rows[0], sessionsResult.rows);
}

async function persistRoom(client, room) {
  const status = room.state
    ? (room.state.gameOver ? 'finished' : 'active')
    : (room.status || 'lobby');
  const now = new Date();
  const stateToSave = sanitizeState(room.state);

  if (stateToSave) {
    stateToSave.lastActivity = Date.now();
  }

  await client.query(
    `UPDATE rooms
     SET status = $2,
         host_player_id = $3,
         lobby_players_json = $4::jsonb,
         game_state_json = $5::jsonb,
         last_activity_at = $6,
         updated_at = NOW()
     WHERE room_code = $1`,
    [
      room.roomCode,
      status,
      room.hostPlayerId,
      JSON.stringify(sanitizeLobbyPlayers(room.lobbyPlayers)),
      JSON.stringify(stateToSave),
      now,
    ]
  );
}

function assertRoomAvailable(room) {
  if (!room) return { error: 'Room not found' };
  if (room.status === 'expired') return { error: 'Room expired' };
  return null;
}

async function createRoom(socketId, playerName) {
  return db.withTransaction(async (client) => {
    let roomCode = null;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const candidate = generateRoomCode();
      const exists = await client.query(
        'SELECT 1 FROM rooms WHERE room_code = $1',
        [candidate]
      );
      if (exists.rowCount === 0) {
        roomCode = candidate;
        break;
      }
    }

    if (!roomCode) {
      return { error: 'Could not create a unique room code' };
    }

    const playerId = generatePlayerId();
    const reconnectToken = createReconnectToken();

    await client.query(
      `INSERT INTO rooms (
         room_code, status, host_player_id, lobby_players_json, game_state_json, last_activity_at
       )
       VALUES ($1, 'lobby', $2, $3::jsonb, NULL, NOW())`,
      [roomCode, playerId, JSON.stringify([{ id: playerId, name: playerName }])]
    );

    await client.query(
      `INSERT INTO player_sessions (
         player_id, room_code, player_name, reconnect_token, last_socket_id, is_active, last_seen_at
       )
       VALUES ($1, $2, $3, $4, $5, TRUE, NOW())`,
      [playerId, roomCode, playerName, reconnectToken, socketId]
    );

    bindSocket(socketId, roomCode, playerId);

    return {
      roomCode,
      playerId,
      playerName,
      reconnectToken,
      players: [{ id: playerId, name: playerName }],
      hostId: playerId,
    };
  });
}

async function joinRoom(roomCode, socketId, playerName) {
  return db.withTransaction(async (client) => {
    const room = await fetchLockedRoom(client, roomCode);
    const availability = assertRoomAvailable(room);
    if (availability) return availability;
    if (room.state) return { error: 'Game already in progress' };
    if (room.lobbyPlayers.length >= MAX_PLAYERS) return { error: 'Room is full (max 5 players)' };
    if (room.lobbyPlayers.some((player) => player.name.toLowerCase() === playerName.toLowerCase())) {
      return { error: 'Name already taken in this room' };
    }

    const playerId = generatePlayerId();
    const reconnectToken = createReconnectToken();

    room.lobbyPlayers.push({ id: playerId, name: playerName, socketId });

    await client.query(
      `INSERT INTO player_sessions (
         player_id, room_code, player_name, reconnect_token, last_socket_id, is_active, last_seen_at
       )
       VALUES ($1, $2, $3, $4, $5, TRUE, NOW())`,
      [playerId, roomCode, playerName, reconnectToken, socketId]
    );

    await persistRoom(client, room);
    bindSocket(socketId, roomCode, playerId);

    return {
      playerId,
      playerName,
      reconnectToken,
      players: sanitizeLobbyPlayers(room.lobbyPlayers),
      hostId: room.hostPlayerId,
    };
  });
}

async function startGame(roomCode, socketId) {
  return db.withTransaction(async (client) => {
    const room = await fetchLockedRoom(client, roomCode);
    const availability = assertRoomAvailable(room);
    if (availability) return availability;

    const binding = getBindingBySocket(socketId);
    if (!binding || binding.roomCode !== roomCode) return { error: 'Not in this room' };
    if (binding.playerId !== room.hostPlayerId) return { error: 'Only the host can start the game' };
    if (room.lobbyPlayers.length < 2) return { error: 'Need at least 2 players to start' };
    if (room.state) return { error: 'Game already started' };

    room.state = createGameState(roomCode, room.lobbyPlayers);
    room.status = 'active';

    for (const player of Object.values(room.state.players)) {
      player.socketId = getSocketIdForPlayer(roomCode, player.id);
    }

    await persistRoom(client, room);

    return { state: room.state };
  });
}

async function resumeSession(socketId, roomCode, playerId, reconnectToken) {
  return db.withTransaction(async (client) => {
    const room = await fetchLockedRoom(client, roomCode);
    const availability = assertRoomAvailable(room);
    if (availability) return availability;

    const sessionResult = await client.query(
      `SELECT *
       FROM player_sessions
       WHERE player_id = $1
         AND room_code = $2
         AND reconnect_token = $3`,
      [playerId, roomCode, reconnectToken]
    );

    if (sessionResult.rowCount === 0) {
      return { error: 'Session not found' };
    }

    const session = sessionResult.rows[0];

    await client.query(
      `UPDATE player_sessions
       SET last_socket_id = $2,
           last_seen_at = NOW(),
           updated_at = NOW()
       WHERE player_id = $1`,
      [playerId, socketId]
    );

    bindSocket(socketId, roomCode, playerId);

    if (room.state?.players?.[playerId]) {
      room.state.players[playerId].socketId = socketId;
      await persistRoom(client, room);
      return {
        screen: 'game',
        roomCode,
        playerId,
        playerName: session.player_name,
        state: room.state,
      };
    }

    return {
      screen: 'lobby',
      roomCode,
      playerId,
      playerName: session.player_name,
      players: sanitizeLobbyPlayers(room.lobbyPlayers),
      hostId: room.hostPlayerId,
    };
  });
}

async function withLockedRoom(roomCode, fn) {
  return db.withTransaction(async (client) => {
    const room = await fetchLockedRoom(client, roomCode);
    const availability = assertRoomAvailable(room);
    if (availability) return availability;

    const result = await fn({ client, room });

    if (!result?.error && result?.persist !== false) {
      await persistRoom(client, room);
    }

    return result;
  });
}

async function runGameAction(roomCode, socketId, fn) {
  return withLockedRoom(roomCode, async ({ room }) => {
    if (!room?.state) return { error: 'Game not found' };

    const binding = getBindingBySocket(socketId);
    if (!binding || binding.roomCode !== roomCode) return { error: 'Not in this room' };

    const playerId = binding.playerId;
    const result = await fn({ room, state: room.state, playerId });

    return {
      ...result,
      room,
      playerId,
    };
  });
}

async function handleDisconnect(socketId) {
  const binding = clearSocketBinding(socketId);
  if (!binding) return null;

  return db.withTransaction(async (client) => {
    const room = await fetchLockedRoom(client, binding.roomCode);
    if (!room) return null;

    await client.query(
      `UPDATE player_sessions
       SET last_socket_id = NULL,
           last_seen_at = NOW(),
           updated_at = NOW()
       WHERE player_id = $1`,
      [binding.playerId]
    );

    if (room.state?.players?.[binding.playerId]) {
      room.state.players[binding.playerId].socketId = null;
      await persistRoom(client, room);
    }

    return {
      roomCode: binding.roomCode,
      playerId: binding.playerId,
      disconnected: true,
    };
  });
}

async function expireStaleRooms() {
  await db.query(
    `UPDATE rooms
     SET status = 'expired',
         updated_at = NOW()
     WHERE status <> 'expired'
       AND last_activity_at < NOW() - INTERVAL '72 hours'`
  );
}

function startCleanupJob() {
  setInterval(() => {
    expireStaleRooms().catch((error) => {
      console.error('Failed to expire stale rooms:', error);
    });
  }, 30 * 60 * 1000);
}

module.exports = {
  createRoom,
  joinRoom,
  startGame,
  resumeSession,
  withLockedRoom,
  runGameAction,
  handleDisconnect,
  getBindingBySocket,
  getSocketIdForPlayer,
  expireStaleRooms,
  startCleanupJob,
};
