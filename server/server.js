const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const db = require('./db');
const gm = require('./gameManager');
const ge = require('./gameEngine');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

app.use(cors());
app.use(express.json());

const CLIENT_DIST = path.join(__dirname, '../client/dist');
app.use(express.static(CLIENT_DIST));

app.get('/healthz', async (_req, res) => {
  try {
    await db.checkHealth();
    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(503).json({ ok: false, error: 'database_unavailable' });
  }
});

const PORT = process.env.PORT || 3001;

function broadcast(roomCode, event, data) {
  io.to(roomCode).emit(event, data);
}

function broadcastState(roomCode, state) {
  io.to(roomCode).emit('state_update', state);
}

function emitError(socket, message, code = 'GENERIC') {
  socket.emit('error', { message, code });
}

function buildLeaderboard(state) {
  return Object.values(state.players)
    .map((player) => ({
      id: player.id,
      name: player.name,
      tokenColor: player.tokenColor,
      totalAssets: ge.calculateTotalAssets(state, player.id),
      isActive: player.isActive,
    }))
    .sort((a, b) => b.totalAssets - a.totalAssets);
}

function emitEngineEvents(roomCode, events = []) {
  for (const evt of events) {
    if (evt.type === 'card_drawn') {
      broadcast(roomCode, 'card_drawn', {
        deck: evt.deck,
        card: {
          id: evt.card.id,
          title: evt.card.title,
          description: evt.card.description,
          historicalNote: evt.card.historicalNote,
          effectType: evt.card.effect?.type,
        },
      });
    } else if (evt.type === 'auction_started') {
      broadcast(roomCode, 'auction_started', {
        propertyId: evt.propertyId,
        propertyData: evt.propertyData,
        startingBid: 0,
      });
    } else if (evt.type === 'auction_updated') {
      broadcast(roomCode, 'auction_updated', evt);
    } else if (evt.type === 'auction_ended') {
      broadcast(roomCode, 'auction_ended', evt);
    }
  }
}

async function runLockedGameAction(socket, roomCode, actionFn) {
  const result = await gm.runGameAction(roomCode, socket.id, ({ room, state, playerId }) => {
    const actionResult = actionFn({ room, state, playerId });
    if (actionResult?.error) {
      return actionResult;
    }

    if (actionResult?.bankruptPlayerId) {
      actionResult.bankruptResult = ge.declareBankruptcy(
        state,
        actionResult.bankruptPlayerId,
        actionResult.creditorId
      );
    }

    return actionResult;
  });

  if (result.error) {
    emitError(socket, result.error);
    return null;
  }

  emitEngineEvents(roomCode, result.events);

  if (result.bankruptPlayerId) {
    broadcast(roomCode, 'bankruptcy_declared', {
      playerId: result.bankruptPlayerId,
      creditor: result.creditorId || 'bank',
    });

    if (result.bankruptResult?.gameOver) {
      broadcast(roomCode, 'game_over', {
        winner: result.bankruptResult.winner,
        leaderboard: buildLeaderboard(result.room.state),
      });
    }
  }

  broadcastState(roomCode, result.room.state);
  return result;
}

io.on('connection', (socket) => {
  console.log(`[+] ${socket.id} connected`);

  function onAsync(eventName, handler) {
    socket.on(eventName, (payload = {}) => {
      Promise.resolve(handler(payload)).catch((error) => {
        console.error(`Socket handler failed for ${eventName}:`, error);
        emitError(socket, 'Server error', 'SERVER_ERROR');
      });
    });
  }

  onAsync('create_room', async ({ playerName }) => {
    if (!playerName?.trim()) return emitError(socket, 'Name is required');

    const result = await gm.createRoom(socket.id, playerName.trim());
    if (result.error) return emitError(socket, result.error);

    socket.join(result.roomCode);
    socket.emit('room_created', {
      roomCode: result.roomCode,
      playerId: result.playerId,
      playerName: result.playerName,
      reconnectToken: result.reconnectToken,
      players: result.players,
      hostId: result.hostId,
    });
    console.log(`[+] Room ${result.roomCode} created by ${playerName}`);
  });

  onAsync('join_room', async ({ roomCode, playerName }) => {
    if (!roomCode || !playerName?.trim()) {
      return emitError(socket, 'Room code and name required');
    }

    const normalizedRoomCode = roomCode.toUpperCase();
    const result = await gm.joinRoom(normalizedRoomCode, socket.id, playerName.trim());
    if (result.error) return emitError(socket, result.error);

    socket.join(normalizedRoomCode);
    socket.emit('room_joined', {
      playerId: result.playerId,
      roomCode: normalizedRoomCode,
      playerName: result.playerName,
      reconnectToken: result.reconnectToken,
      players: result.players,
      hostId: result.hostId,
    });
    broadcast(normalizedRoomCode, 'room_updated', {
      players: result.players,
      hostId: result.hostId,
    });
    console.log(`[+] ${playerName} joined room ${normalizedRoomCode}`);
  });

  onAsync('start_game', async ({ roomCode }) => {
    const result = await gm.startGame(roomCode, socket.id);
    if (result.error) return emitError(socket, result.error);

    broadcast(roomCode, 'game_started', result.state);
    console.log(`[+] Game started in room ${roomCode}`);
  });

  onAsync('resume_session', async ({ roomCode, playerId, reconnectToken }) => {
    if (!roomCode || !playerId || !reconnectToken) {
      return emitError(socket, 'Session details required');
    }

    const result = await gm.resumeSession(
      socket.id,
      roomCode.toUpperCase(),
      playerId,
      reconnectToken
    );

    if (result.error) return emitError(socket, result.error, 'SESSION_NOT_FOUND');

    socket.join(result.roomCode);
    socket.emit('session_resumed', result);

    if (result.screen === 'lobby') {
      broadcast(result.roomCode, 'room_updated', {
        players: result.players,
        hostId: result.hostId,
      });
    } else if (result.state) {
      broadcastState(result.roomCode, result.state);
    }
  });

  onAsync('leave_game', async ({ roomCode }) => {
    if (!roomCode) return emitError(socket, 'Room code required');

    const result = await gm.leaveRoom(roomCode, socket.id);
    if (result.error) return emitError(socket, result.error);

    socket.emit('left_game', { roomCode });
    socket.leave(roomCode);

    if (result.deleted) {
      return;
    }

    if (result.players) {
      broadcast(roomCode, 'room_updated', {
        players: result.players,
        hostId: result.hostId,
      });
      return;
    }

    if (result.bankruptPlayerId) {
      broadcast(roomCode, 'bankruptcy_declared', {
        playerId: result.bankruptPlayerId,
        creditor: 'bank',
      });
    }

    if (result.bankruptcyResult?.gameOver) {
      broadcast(roomCode, 'game_over', {
        winner: result.bankruptcyResult.winner,
        leaderboard: buildLeaderboard(result.room.state),
      });
    }

    if (result.room?.state) {
      broadcastState(roomCode, result.room.state);
    }
  });

  onAsync('roll_dice', async ({ roomCode }) => {
    await runLockedGameAction(socket, roomCode, ({ state, playerId }) => {
      if (state.playerOrder[state.currentPlayerIndex] !== playerId) {
        return { error: 'Not your turn' };
      }
      if (state.phase !== 'WAITING_FOR_ROLL' && state.phase !== 'WAITING_FOR_JAIL_DECISION') {
        return { error: 'Cannot roll right now' };
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
      return result;
    });
  });

  onAsync('buy_property', async ({ roomCode }) => {
    await runLockedGameAction(socket, roomCode, ({ state, playerId }) => ge.buyProperty(state, playerId));
  });

  onAsync('decline_buy', async ({ roomCode }) => {
    await runLockedGameAction(socket, roomCode, ({ state, playerId }) => ge.declineBuy(state, playerId));
  });

  onAsync('auction_bid', async ({ roomCode, amount }) => {
    emitError(socket, 'Auctions are disabled');
  });

  onAsync('auction_pass', async ({ roomCode }) => {
    emitError(socket, 'Auctions are disabled');
  });

  onAsync('end_turn', async ({ roomCode }) => {
    await runLockedGameAction(socket, roomCode, ({ state, playerId }) => {
      if (state.playerOrder[state.currentPlayerIndex] !== playerId) {
        return { error: 'Not your turn' };
      }
      return ge.endTurn(state, playerId);
    });
  });

  onAsync('build_house', async ({ roomCode, propertyId }) => {
    await runLockedGameAction(socket, roomCode, ({ state, playerId }) => ge.buildHouse(state, playerId, propertyId));
  });

  onAsync('build_hotel', async ({ roomCode, propertyId }) => {
    await runLockedGameAction(socket, roomCode, ({ state, playerId }) => ge.buildHotel(state, playerId, propertyId));
  });

  onAsync('sell_house', async ({ roomCode, propertyId }) => {
    await runLockedGameAction(socket, roomCode, ({ state, playerId }) => ge.sellHouse(state, playerId, propertyId));
  });

  onAsync('sell_hotel', async ({ roomCode, propertyId }) => {
    await runLockedGameAction(socket, roomCode, ({ state, playerId }) => ge.sellHotel(state, playerId, propertyId));
  });

  onAsync('mortgage_property', async ({ roomCode, propertyId }) => {
    await runLockedGameAction(socket, roomCode, ({ state, playerId }) => ge.mortgageProperty(state, playerId, propertyId));
  });

  onAsync('unmortgage_property', async ({ roomCode, propertyId }) => {
    await runLockedGameAction(socket, roomCode, ({ state, playerId }) => ge.unmortgageProperty(state, playerId, propertyId));
  });

  onAsync('propose_trade', async ({ roomCode, targetPlayerId, offer, request }) => {
    const result = await runLockedGameAction(socket, roomCode, ({ room, state, playerId }) => {
      const actionResult = ge.proposeTrade(state, playerId, targetPlayerId, offer, request);
      if (!actionResult.error) {
        actionResult.targetSocketId = room.state.players[targetPlayerId]?.socketId || null;
        actionResult.fromPlayerName = room.state.players[playerId]?.name;
      }
      return actionResult;
    });

    if (!result || result.error) return;

    if (result.targetSocketId) {
      io.to(result.targetSocketId).emit('trade_proposed', {
        tradeId: result.tradeId,
        fromPlayer: result.fromPlayerName,
        offer,
        request,
      });
    }
  });

  onAsync('accept_trade', async ({ roomCode }) => {
    await runLockedGameAction(socket, roomCode, ({ state, playerId }) => ge.acceptTrade(state, playerId));
  });

  onAsync('reject_trade', async ({ roomCode }) => {
    await runLockedGameAction(socket, roomCode, ({ state, playerId }) => ge.rejectTrade(state, playerId));
  });

  onAsync('jail_pay_fine', async ({ roomCode }) => {
    await runLockedGameAction(socket, roomCode, ({ state, playerId }) => ge.resolveJailDecision(state, playerId, 'pay'));
  });

  onAsync('jail_use_card', async ({ roomCode }) => {
    await runLockedGameAction(socket, roomCode, ({ state, playerId }) => ge.resolveJailDecision(state, playerId, 'card'));
  });

  onAsync('income_tax_choice', async ({ roomCode, choice }) => {
    await runLockedGameAction(socket, roomCode, ({ state, playerId }) => ge.resolveIncomeTax(state, playerId, choice));
  });

  onAsync('card_choice', async ({ roomCode, choiceIndex, extraData }) => {
    await runLockedGameAction(socket, roomCode, ({ state, playerId }) => ge.resolveCardChoice(state, playerId, choiceIndex, extraData));
  });

  onAsync('declare_bankruptcy', async ({ roomCode }) => {
    const result = await gm.runGameAction(roomCode, socket.id, ({ room, state, playerId }) => {
      const creditorId = state.pendingAction?.data?.ownerId || null;
      const bankruptcyResult = ge.declareBankruptcy(state, playerId, creditorId);
      return {
        ...bankruptcyResult,
        room,
        bankruptPlayerId: playerId,
        creditorId,
      };
    });

    if (result.error) return emitError(socket, result.error);

    broadcast(roomCode, 'bankruptcy_declared', {
      playerId: result.bankruptPlayerId,
      creditor: result.creditorId || 'bank',
    });

    if (result.gameOver) {
      broadcast(roomCode, 'game_over', {
        winner: result.winner,
        leaderboard: buildLeaderboard(result.room.state),
      });
    }

    broadcastState(roomCode, result.room.state);
  });

  onAsync('send_chat_message', async ({ roomCode, message }) => {
    const result = await gm.runGameAction(roomCode, socket.id, ({ room, state, playerId }) => {
      const player = playerId ? state.players[playerId] : null;
      if (!player) return { error: 'Not in this room' };

      const trimmed = String(message || '').trim();
      if (!trimmed) return { error: 'Message cannot be empty' };

      state.chatMessages = [
        ...state.chatMessages,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          playerId,
          playerName: player.name,
          tokenColor: player.tokenColor,
          message: trimmed.slice(0, 280),
          timestamp: Date.now(),
        },
      ].slice(-60);

      return { room };
    });

    if (result.error) return emitError(socket, result.error);
    broadcastState(roomCode, result.room.state);
  });

  socket.on('disconnect', () => {
    console.log(`[-] ${socket.id} disconnected`);
    gm.handleDisconnect(socket.id).catch((error) => {
      console.error('Disconnect handling failed:', error);
    });
  });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(CLIENT_DIST, 'index.html'));
});

server.listen(PORT, async () => {
  console.log(`CFB Board Game server running on http://0.0.0.0:${PORT}`);
  try {
    await gm.expireStaleRooms();
    gm.startCleanupJob();
  } catch (error) {
    console.error('Failed to initialize room cleanup:', error);
  }
});
