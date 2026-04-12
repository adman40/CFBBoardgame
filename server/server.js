const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const path       = require('path');

const gm = require('./gameManager');
const ge = require('./gameEngine');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

app.use(cors());
app.use(express.json());

// Serve the built React client in production
const CLIENT_DIST = path.join(__dirname, '../client/dist');
app.use(express.static(CLIENT_DIST));

app.get('/healthz', (_req, res) => {
  res.status(200).json({ ok: true });
});

const PORT = process.env.PORT || 3001;

// ─── helpers ──────────────────────────────────────────────────────────────────

function broadcast(roomCode, event, data) {
  io.to(roomCode).emit(event, data);
}

function broadcastState(roomCode) {
  const room = gm.getRoom(roomCode);
  if (room?.state) {
    io.to(roomCode).emit('state_update', room.state);
    room.state.lastActivity = Date.now();
  }
}

function emitError(socket, message, code = 'GENERIC') {
  socket.emit('error', { message, code });
}

function handleEngineResult(socket, roomCode, result) {
  if (result.error) {
    emitError(socket, result.error);
    return false;
  }

  // Emit any special pre-state events
  for (const evt of (result.events || [])) {
    if (evt.type === 'card_drawn') {
      broadcast(roomCode, 'card_drawn', {
        deck: evt.deck,
        card: {
          id:             evt.card.id,
          title:          evt.card.title,
          description:    evt.card.description,
          historicalNote: evt.card.historicalNote,
          effectType:     evt.card.effect?.type,
        },
      });
    } else if (evt.type === 'auction_started') {
      broadcast(roomCode, 'auction_started', {
        propertyId:   evt.propertyId,
        propertyData: evt.propertyData,
        startingBid:  0,
      });
    } else if (evt.type === 'auction_updated') {
      broadcast(roomCode, 'auction_updated', evt);
    } else if (evt.type === 'auction_ended') {
      broadcast(roomCode, 'auction_ended', evt);
    }
  }

  // Handle bankruptcy if signaled
  if (result.bankruptPlayerId) {
    const bankruptResult = ge.declareBankruptcy(
      gm.getRoom(roomCode).state,
      result.bankruptPlayerId,
      result.creditorId
    );
    broadcast(roomCode, 'bankruptcy_declared', {
      playerId:  result.bankruptPlayerId,
      creditor:  result.creditorId || 'bank',
    });
    if (bankruptResult.gameOver) {
      broadcast(roomCode, 'game_over', {
        winner:      bankruptResult.winner,
        leaderboard: buildLeaderboard(gm.getRoom(roomCode).state),
      });
    }
  }

  broadcastState(roomCode);
  return true;
}

function buildLeaderboard(state) {
  return Object.values(state.players)
    .map(p => ({
      id:         p.id,
      name:       p.name,
      tokenColor: p.tokenColor,
      totalAssets: ge.calculateTotalAssets(state, p.id),
      isActive:   p.isActive,
    }))
    .sort((a, b) => b.totalAssets - a.totalAssets);
}

// ─── socket events ────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`[+] ${socket.id} connected`);

  // ── LOBBY ──────────────────────────────────────────────────────────────────

  socket.on('create_room', ({ playerName }) => {
    if (!playerName?.trim()) return emitError(socket, 'Name is required');
    const result = gm.createRoom(socket.id, playerName.trim());
    socket.join(result.roomCode);
    socket.emit('room_created', { roomCode: result.roomCode, playerId: result.playerId });
    console.log(`[+] Room ${result.roomCode} created by ${playerName}`);
  });

  socket.on('join_room', ({ roomCode, playerName }) => {
    if (!roomCode || !playerName?.trim()) return emitError(socket, 'Room code and name required');
    const result = gm.joinRoom(roomCode.toUpperCase(), socket.id, playerName.trim());
    if (result.error) return emitError(socket, result.error);
    socket.join(roomCode.toUpperCase());
    socket.emit('room_joined', { playerId: result.playerId, roomCode: roomCode.toUpperCase() });
    broadcast(roomCode.toUpperCase(), 'room_updated', { players: result.players, hostId: result.hostId });
    console.log(`[+] ${playerName} joined room ${roomCode}`);
  });

  socket.on('start_game', ({ roomCode }) => {
    const result = gm.startGame(roomCode, socket.id);
    if (result.error) return emitError(socket, result.error);
    broadcast(roomCode, 'game_started', result.state);
    console.log(`[+] Game started in room ${roomCode}`);
  });

  // ── GAME ACTIONS ───────────────────────────────────────────────────────────

  socket.on('roll_dice', ({ roomCode }) => {
    const room = gm.getRoom(roomCode);
    if (!room?.state) return emitError(socket, 'Game not found');
    const playerId = gm.getPlayerIdBySocket(roomCode, socket.id);
    if (!playerId) return emitError(socket, 'Not in this room');

    const state = room.state;
    if (state.playerOrder[state.currentPlayerIndex] !== playerId) {
      return emitError(socket, 'Not your turn');
    }
    if (state.phase !== 'WAITING_FOR_ROLL' && state.phase !== 'WAITING_FOR_JAIL_DECISION') {
      return emitError(socket, 'Cannot roll right now');
    }

    const result = ge.rollDiceAction(state, playerId);
    if (result.dice) {
      broadcast(roomCode, 'dice_rolled', {
        die1: result.dice.die1,
        die2: result.dice.die2,
        total: result.dice.die1 + result.dice.die2,
        isDoubles: result.dice.die1 === result.dice.die2,
        playerId,
      });
    }
    handleEngineResult(socket, roomCode, result);
  });

  socket.on('buy_property', ({ roomCode }) => {
    const room = gm.getRoom(roomCode);
    if (!room?.state) return emitError(socket, 'Game not found');
    const playerId = gm.getPlayerIdBySocket(roomCode, socket.id);
    const result   = ge.buyProperty(room.state, playerId);
    handleEngineResult(socket, roomCode, result);
  });

  socket.on('decline_buy', ({ roomCode }) => {
    const room = gm.getRoom(roomCode);
    if (!room?.state) return emitError(socket, 'Game not found');
    const playerId = gm.getPlayerIdBySocket(roomCode, socket.id);
    const result   = ge.declineBuy(room.state, playerId);
    handleEngineResult(socket, roomCode, result);
  });

  socket.on('auction_bid', ({ roomCode, amount }) => {
    const room = gm.getRoom(roomCode);
    if (!room?.state) return emitError(socket, 'Game not found');
    const playerId = gm.getPlayerIdBySocket(roomCode, socket.id);
    const result   = ge.processBid(room.state, playerId, amount);
    handleEngineResult(socket, roomCode, result);
  });

  socket.on('auction_pass', ({ roomCode }) => {
    const room = gm.getRoom(roomCode);
    if (!room?.state) return emitError(socket, 'Game not found');
    const playerId = gm.getPlayerIdBySocket(roomCode, socket.id);
    const result   = ge.passAuction(room.state, playerId);
    handleEngineResult(socket, roomCode, result);
  });

  socket.on('end_turn', ({ roomCode }) => {
    const room = gm.getRoom(roomCode);
    if (!room?.state) return emitError(socket, 'Game not found');
    const playerId = gm.getPlayerIdBySocket(roomCode, socket.id);
    if (room.state.playerOrder[room.state.currentPlayerIndex] !== playerId) {
      return emitError(socket, 'Not your turn');
    }
    const result = ge.endTurn(room.state, playerId);
    handleEngineResult(socket, roomCode, result);
  });

  socket.on('build_house', ({ roomCode, propertyId }) => {
    const room = gm.getRoom(roomCode);
    if (!room?.state) return emitError(socket, 'Game not found');
    const playerId = gm.getPlayerIdBySocket(roomCode, socket.id);
    const result   = ge.buildHouse(room.state, playerId, propertyId);
    handleEngineResult(socket, roomCode, result);
  });

  socket.on('build_hotel', ({ roomCode, propertyId }) => {
    const room = gm.getRoom(roomCode);
    if (!room?.state) return emitError(socket, 'Game not found');
    const playerId = gm.getPlayerIdBySocket(roomCode, socket.id);
    const result   = ge.buildHotel(room.state, playerId, propertyId);
    handleEngineResult(socket, roomCode, result);
  });

  socket.on('sell_house', ({ roomCode, propertyId }) => {
    const room = gm.getRoom(roomCode);
    if (!room?.state) return emitError(socket, 'Game not found');
    const playerId = gm.getPlayerIdBySocket(roomCode, socket.id);
    const result   = ge.sellHouse(room.state, playerId, propertyId);
    handleEngineResult(socket, roomCode, result);
  });

  socket.on('sell_hotel', ({ roomCode, propertyId }) => {
    const room = gm.getRoom(roomCode);
    if (!room?.state) return emitError(socket, 'Game not found');
    const playerId = gm.getPlayerIdBySocket(roomCode, socket.id);
    const result   = ge.sellHotel(room.state, playerId, propertyId);
    handleEngineResult(socket, roomCode, result);
  });

  socket.on('mortgage_property', ({ roomCode, propertyId }) => {
    const room = gm.getRoom(roomCode);
    if (!room?.state) return emitError(socket, 'Game not found');
    const playerId = gm.getPlayerIdBySocket(roomCode, socket.id);
    const result   = ge.mortgageProperty(room.state, playerId, propertyId);
    handleEngineResult(socket, roomCode, result);
  });

  socket.on('unmortgage_property', ({ roomCode, propertyId }) => {
    const room = gm.getRoom(roomCode);
    if (!room?.state) return emitError(socket, 'Game not found');
    const playerId = gm.getPlayerIdBySocket(roomCode, socket.id);
    const result   = ge.unmortgageProperty(room.state, playerId, propertyId);
    handleEngineResult(socket, roomCode, result);
  });

  socket.on('propose_trade', ({ roomCode, targetPlayerId, offer, request }) => {
    const room = gm.getRoom(roomCode);
    if (!room?.state) return emitError(socket, 'Game not found');
    const playerId = gm.getPlayerIdBySocket(roomCode, socket.id);
    const result   = ge.proposeTrade(room.state, playerId, targetPlayerId, offer, request);
    if (result.error) return emitError(socket, result.error);

    // Notify the trade target
    const targetSocket = Object.keys(room.playerSocketMap || {}).find(
      sid => room.playerSocketMap[sid] === targetPlayerId
    );
    // Find target socket ID from state
    const targetPlayer = room.state.players[targetPlayerId];
    if (targetPlayer?.socketId) {
      io.to(targetPlayer.socketId).emit('trade_proposed', {
        tradeId:    result.tradeId,
        fromPlayer: room.state.players[playerId].name,
        offer,
        request,
      });
    }
    broadcastState(roomCode);
  });

  socket.on('accept_trade', ({ roomCode }) => {
    const room = gm.getRoom(roomCode);
    if (!room?.state) return emitError(socket, 'Game not found');
    const playerId = gm.getPlayerIdBySocket(roomCode, socket.id);
    const result   = ge.acceptTrade(room.state, playerId);
    handleEngineResult(socket, roomCode, result);
  });

  socket.on('reject_trade', ({ roomCode }) => {
    const room = gm.getRoom(roomCode);
    if (!room?.state) return emitError(socket, 'Game not found');
    const playerId = gm.getPlayerIdBySocket(roomCode, socket.id);
    const result   = ge.rejectTrade(room.state, playerId);
    handleEngineResult(socket, roomCode, result);
  });

  socket.on('jail_pay_fine', ({ roomCode }) => {
    const room = gm.getRoom(roomCode);
    if (!room?.state) return emitError(socket, 'Game not found');
    const playerId = gm.getPlayerIdBySocket(roomCode, socket.id);
    const result   = ge.resolveJailDecision(room.state, playerId, 'pay');
    handleEngineResult(socket, roomCode, result);
  });

  socket.on('jail_use_card', ({ roomCode }) => {
    const room = gm.getRoom(roomCode);
    if (!room?.state) return emitError(socket, 'Game not found');
    const playerId = gm.getPlayerIdBySocket(roomCode, socket.id);
    const result   = ge.resolveJailDecision(room.state, playerId, 'card');
    handleEngineResult(socket, roomCode, result);
  });

  socket.on('income_tax_choice', ({ roomCode, choice }) => {
    const room = gm.getRoom(roomCode);
    if (!room?.state) return emitError(socket, 'Game not found');
    const playerId = gm.getPlayerIdBySocket(roomCode, socket.id);
    const result   = ge.resolveIncomeTax(room.state, playerId, choice);
    handleEngineResult(socket, roomCode, result);
  });

  socket.on('card_choice', ({ roomCode, choiceIndex, extraData }) => {
    const room = gm.getRoom(roomCode);
    if (!room?.state) return emitError(socket, 'Game not found');
    const playerId = gm.getPlayerIdBySocket(roomCode, socket.id);
    const result   = ge.resolveCardChoice(room.state, playerId, choiceIndex, extraData);
    handleEngineResult(socket, roomCode, result);
  });

  socket.on('declare_bankruptcy', ({ roomCode }) => {
    const room = gm.getRoom(roomCode);
    if (!room?.state) return emitError(socket, 'Game not found');
    const playerId = gm.getPlayerIdBySocket(roomCode, socket.id);
    const state    = room.state;

    // Figure out creditor from pendingAction
    const creditorId = state.pendingAction?.data?.ownerId || null;
    const result = ge.declareBankruptcy(state, playerId, creditorId);

    broadcast(roomCode, 'bankruptcy_declared', { playerId, creditor: creditorId || 'bank' });
    if (result.gameOver) {
      broadcast(roomCode, 'game_over', {
        winner:      result.winner,
        leaderboard: buildLeaderboard(state),
      });
    }
    broadcastState(roomCode);
  });

  socket.on('send_chat_message', ({ roomCode, message }) => {
    const room = gm.getRoom(roomCode);
    if (!room?.state) return emitError(socket, 'Game not found');

    const playerId = gm.getPlayerIdBySocket(roomCode, socket.id);
    const player = playerId ? room.state.players[playerId] : null;
    if (!player) return emitError(socket, 'Not in this room');

    const trimmed = String(message || '').trim();
    if (!trimmed) return emitError(socket, 'Message cannot be empty');

    room.state.chatMessages = [
      ...room.state.chatMessages,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        playerId,
        playerName: player.name,
        tokenColor: player.tokenColor,
        message: trimmed.slice(0, 280),
        timestamp: Date.now(),
      },
    ].slice(-60);

    broadcastState(roomCode);
  });

  // ── RECONNECT ──────────────────────────────────────────────────────────────

  socket.on('reconnect_player', ({ roomCode, playerName }) => {
    const result = gm.handleReconnect(socket.id, roomCode, playerName);
    if (result.error) return emitError(socket, result.error);
    socket.join(roomCode);
    socket.emit('reconnected', { playerId: result.playerId, state: result.state });
  });

  // ── DISCONNECT ─────────────────────────────────────────────────────────────

  socket.on('disconnect', () => {
    console.log(`[-] ${socket.id} disconnected`);
    const result = gm.handleDisconnect(socket.id);
    if (!result) return;
    if (result.players) {
      broadcast(result.roomCode, 'room_updated', { players: result.players, hostId: result.hostId });
    }
  });
});

// Catch-all: serve React app for any non-API route
app.get('*', (req, res) => {
  res.sendFile(path.join(CLIENT_DIST, 'index.html'));
});

server.listen(PORT, () => {
  console.log(`CFB Board Game server running on http://0.0.0.0:${PORT}`);
});
