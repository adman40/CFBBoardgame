const { PROPERTIES, PROPERTY_GROUPS } = require('./propertyData');
const { shuffleDeck, GRIDIRON_EVENTS, COMMISSIONERS_OFFICE } = require('./cardDecks');

const TOKEN_COLORS = ['#E53E3E', '#3182CE', '#38A169', '#D69E2E', '#805AD5'];
const TOKEN_NAMES  = ['Red',     'Blue',    'Green',   'Gold',    'Purple'];

const STARTING_CASH = 15_000_000_000; // $15B in raw dollars (displayed as $15M in game)

function buildInitialProperties() {
  const state = {};
  for (const [id, def] of Object.entries(PROPERTIES)) {
    state[id] = {
      id:            def.id,
      spaceIndex:    def.spaceIndex,
      ownerId:       null,
      isMortgaged:   false,
      houses:        0,       // 0-4 recruiting classes
      hasHotel:      false,   // stadium expansion
      // embed static data for client convenience
      name:          def.name,
      group:         def.group,
      type:          def.type,
      price:         def.price,
      mortgageValue: def.mortgageValue,
      buildCost:     def.buildCost,
      rents:         def.rents,
      historicalNote: def.historicalNote,
      eraName:       def.eraName,
    };
  }
  return state;
}

function createGameState(roomCode, playerList) {
  // playerList: [{ id, name, socketId }]
  const players = {};
  const playerOrder = [];

  playerList.forEach((p, idx) => {
    players[p.id] = {
      id:                  p.id,
      name:                p.name,
      socketId:            p.socketId,
      tokenColor:          TOKEN_COLORS[idx] || TOKEN_COLORS[0],
      tokenName:           TOKEN_NAMES[idx]  || TOKEN_NAMES[0],
      position:            0,
      cash:                STARTING_CASH,
      isActive:            true,
      isJailed:            false,
      jailTurnsRemaining:  0,
      hasEscapeCard:       false,
      consecutiveDoubles:  0,
      ownedPropertyIds:    [],
      skippedTurns:        0,
      revenueBonus:        {},    // propertyId -> bonus amount (from integration card)
    };
    playerOrder.push(p.id);
  });

  return {
    roomCode,
    phase:               'WAITING_FOR_ROLL',
    turnNumber:          1,
    players,
    playerOrder,
    currentPlayerIndex:  0,
    hostPlayerId:        playerList[0].id,
    properties:          buildInitialProperties(),
    gridironEventsDeck:  shuffleDeck(GRIDIRON_EVENTS),
    commissionersDeck:   shuffleDeck(COMMISSIONERS_OFFICE),
    activeAuction:       null,
    activeTrade:         null,
    pendingAction:       null,
    lastDiceRoll:        null,
    lastRolledDoubles:   false,
    turnLog:             [],
    chatMessages:        [],
    gameOver:            false,
    winner:              null,
    shortGame:           false,
  };
}

function logEvent(state, playerId, message, type = 'general') {
  state.turnLog = [
    { timestamp: Date.now(), playerId, message, type },
    ...state.turnLog,
  ].slice(0, 30);
}

function currentPlayer(state) {
  return state.players[state.playerOrder[state.currentPlayerIndex]];
}

module.exports = { createGameState, logEvent, currentPlayer, STARTING_CASH };
