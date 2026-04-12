/**
 * gameEngine.js — Pure game logic. No Socket.io, no side effects.
 * All functions take state + args, mutate state in place, and return
 * { state, events: [] } where events are things to emit to clients.
 */

const { BOARD_SPACES } = require('./boardData');
const { PROPERTIES, PROPERTY_GROUPS } = require('./propertyData');
const { GRIDIRON_MAP, COMMISSIONERS_MAP, shuffleDeck, GRIDIRON_EVENTS, COMMISSIONERS_OFFICE } = require('./cardDecks');
const { rollDice: _roll, formatMoney } = require('./utils');
const { logEvent, currentPlayer, STARTING_CASH } = require('./GameState');

const GO_SALARY   = 2_000_000_000; // $2B raw = displayed as $2M
const JAIL_SPACE  = 10;
const INCOME_TAX_FLAT = 200_000_000;
const LUXURY_TAX  = 100_000_000;
const JAIL_FINE   = 50_000_000;

// ─── helpers ─────────────────────────────────────────────────────────────────

function getActivePlayers(state) {
  return state.playerOrder.filter(id => state.players[id].isActive);
}

function countOwnedInGroup(state, group, ownerId) {
  return (PROPERTY_GROUPS[group] || []).filter(pid => {
    const p = state.properties[pid];
    return p && p.ownerId === ownerId;
  }).length;
}

function ownsFullGroup(state, group, ownerId) {
  const ids = PROPERTY_GROUPS[group] || [];
  return ids.length > 0 && ids.every(pid => state.properties[pid]?.ownerId === ownerId);
}

function anyMortgagedInGroup(state, group) {
  return (PROPERTY_GROUPS[group] || []).some(pid => state.properties[pid]?.isMortgaged);
}

function totalHousesInGroup(state, group) {
  return (PROPERTY_GROUPS[group] || []).reduce((sum, pid) => {
    const p = state.properties[pid];
    return sum + (p ? p.houses : 0);
  }, 0);
}

function minHousesInGroup(state, group) {
  const counts = (PROPERTY_GROUPS[group] || []).map(pid => state.properties[pid]?.houses ?? 0);
  return Math.min(...counts);
}

function maxHousesInGroup(state, group) {
  const counts = (PROPERTY_GROUPS[group] || []).map(pid => state.properties[pid]?.houses ?? 0);
  return Math.max(...counts);
}

function calculateTotalAssets(state, playerId) {
  const player = state.players[playerId];
  let total = player.cash;
  for (const pid of player.ownedPropertyIds) {
    const prop = state.properties[pid];
    const def  = PROPERTIES[pid];
    if (!def) continue;
    if (prop.isMortgaged) {
      total += prop.mortgageValue;
    } else {
      total += def.price;
      if (prop.type === 'property') {
        total += prop.houses * (def.buildCost || 0);
        if (prop.hasHotel) total += (def.buildCost || 0);
      }
    }
  }
  return total;
}

function movePlayer(state, playerId, targetSpace) {
  const player = state.players[playerId];
  const from   = player.position;
  let passedGo = false;

  if (targetSpace !== from) {
    if (targetSpace < from) passedGo = true;
    player.position = targetSpace;
    if (passedGo) {
      player.cash += GO_SALARY;
      logEvent(state, playerId, `${player.name} passed KICKOFF — collected $2M!`, 'move');
    }
  }
  return { passedGo };
}

function advanceSpaces(state, playerId, spaces) {
  const player = state.players[playerId];
  const target = (player.position + spaces + 40) % 40;
  return movePlayer(state, playerId, target);
}

function finishActionPhase(state, playerId) {
  const player = state.players[playerId];
  const isCurrentTurn = state.playerOrder[state.currentPlayerIndex] === playerId;
  const canBonusRoll = Boolean(player && isCurrentTurn && state.lastRolledDoubles && !player.isJailed);
  const nextPhase = canBonusRoll ? 'WAITING_FOR_ROLL' : 'TURN_ACTIONS_COMPLETE';
  const phaseChanged = state.phase !== nextPhase;

  state.phase = nextPhase;

  if (canBonusRoll && phaseChanged) {
    logEvent(state, playerId, `${player.name} rolled doubles — bonus roll!`, 'move');
  }
}

function nearestSpaceOfType(currentPos, spaceType) {
  for (let i = 1; i <= 40; i++) {
    const idx = (currentPos + i) % 40;
    if (BOARD_SPACES[idx].type === spaceType) return idx;
  }
  return -1;
}

function deductCash(state, playerId, amount) {
  state.players[playerId].cash -= amount;
}

function transferCash(state, fromId, toId, amount) {
  const actual = Math.min(amount, state.players[fromId].cash);
  state.players[fromId].cash -= actual;
  state.players[toId].cash   += actual;
  return actual;
}

function drawFromDeck(state, deck) {
  // deck: 'gridiron' | 'commissioners'
  const deckKey = deck === 'gridiron' ? 'gridironEventsDeck' : 'commissionersDeck';
  const map     = deck === 'gridiron' ? GRIDIRON_MAP : COMMISSIONERS_MAP;
  const allCards = deck === 'gridiron' ? GRIDIRON_EVENTS : COMMISSIONERS_OFFICE;

  if (state[deckKey].length === 0) {
    state[deckKey] = shuffleDeck(allCards);
  }
  const cardId = state[deckKey].shift();
  state[deckKey].push(cardId); // cycle to bottom
  return map[cardId];
}

// ─── sendToJail ───────────────────────────────────────────────────────────────

function sendToJail(state, playerId) {
  const player = state.players[playerId];
  player.position           = JAIL_SPACE;
  player.isJailed           = true;
  player.jailTurnsRemaining = 3;
  player.consecutiveDoubles = 0;
  logEvent(state, playerId, `${player.name} sent to NCAA Probation!`, 'jail');
}

// ─── calculateRent ────────────────────────────────────────────────────────────

function calculateRent(state, propertyId) {
  const prop = state.properties[propertyId];
  if (!prop || prop.isMortgaged || !prop.ownerId) return 0;

  const def = PROPERTIES[propertyId];
  if (!def) return 0;

  if (prop.type === 'tv_contract') {
    const last = state.lastDiceRoll;
    if (!last) return 0;
    const diceTotal   = last.die1 + last.die2;
    const owned       = countOwnedInGroup(state, 'tv_contract', prop.ownerId);
    const multiplier  = owned >= 2 ? 10 : 4;
    return diceTotal * multiplier * 1_000_000_000;
  }

  if (prop.type === 'bowl_game') {
    const owned = countOwnedInGroup(state, 'bowl_game', prop.ownerId);
    return def.rents[Math.min(owned - 1, def.rents.length - 1)];
  }

  // Regular property
  let rentIndex = 0;
  if (prop.hasHotel) {
    rentIndex = 5;
  } else if (prop.houses > 0) {
    rentIndex = prop.houses;
  } else if (ownsFullGroup(state, prop.group, prop.ownerId) && !anyMortgagedInGroup(state, prop.group)) {
    // double base rent for monopoly with no buildings
    return def.rents[0] * 2;
  }

  const base = def.rents[rentIndex] || 0;
  // Add any integration bonus
  const bonus = state.players[prop.ownerId]?.revenueBonus?.[propertyId] || 0;
  return base + bonus;
}

// ─── applyCardEffect ──────────────────────────────────────────────────────────

function applyCardEffect(state, playerId, card) {
  const player = state.players[playerId];
  const events = [];
  const eff    = card.effect;

  switch (eff.type) {
    case 'move_to_space': {
      const from = player.position;
      const to   = eff.spaceIndex;
      let passedGo = false;
      if (eff.collectGoIfPass && to !== from) {
        passedGo = to < from || (to === 0);
      }
      if (eff.spaceIndex === JAIL_SPACE && card.effect.type === 'go_to_jail') {
        // handled below
      }
      player.position = to;
      if (passedGo) {
        player.cash += GO_SALARY;
        logEvent(state, playerId, `${player.name} passed KICKOFF — collected $2M!`, 'move');
      }
      logEvent(state, playerId, `${player.name}: ${card.title}`, 'card');
      // after move, resolve landing
      return { needsLandingResolution: true, events };
    }

    case 'move_relative': {
      advanceSpaces(state, playerId, eff.spaces);
      logEvent(state, playerId, `${player.name} moved ${Math.abs(eff.spaces)} spaces ${eff.spaces > 0 ? 'forward' : 'back'}`, 'card');
      return { needsLandingResolution: true, events };
    }

    case 'move_to_nearest': {
      const nearest = nearestSpaceOfType(player.position, eff.spaceType);
      if (nearest >= 0) {
        const { passedGo } = movePlayer(state, playerId, nearest);
        if (passedGo) logEvent(state, playerId, `${player.name} passed KICKOFF — collected $2M!`, 'move');
      }
      logEvent(state, playerId, `${player.name}: ${card.title}`, 'card');
      // if owned + doubleIfOwned: handled in resolveLanding (doubleRent flag set on pendingAction)
      if (eff.doubleIfOwned) {
        state._cardDoubleRent = true;
      }
      return { needsLandingResolution: true, events };
    }

    case 'collect_from_bank':
      player.cash += eff.amount;
      logEvent(state, playerId, `${player.name} collected ${formatMoney(eff.amount)}: ${card.title}`, 'card');
      finishActionPhase(state, playerId);
      break;

    case 'pay_to_bank':
      player.cash -= eff.amount;
      logEvent(state, playerId, `${player.name} paid ${formatMoney(eff.amount)}: ${card.title}`, 'card');
      finishActionPhase(state, playerId);
      break;

    case 'collect_from_each': {
      const active = getActivePlayers(state).filter(id => id !== playerId);
      let total = 0;
      for (const otherId of active) {
        const amt = Math.min(eff.amount, state.players[otherId].cash);
        state.players[otherId].cash -= amt;
        total += amt;
      }
      player.cash += total;
      logEvent(state, playerId, `${player.name} collected ${formatMoney(eff.amount)} from each player: ${card.title}`, 'card');
      finishActionPhase(state, playerId);
      break;
    }

    case 'pay_to_each': {
      const active = getActivePlayers(state).filter(id => id !== playerId);
      const total = eff.amount * active.length;
      player.cash -= total;
      for (const otherId of active) {
        state.players[otherId].cash += eff.amount;
      }
      logEvent(state, playerId, `${player.name} paid ${formatMoney(eff.amount)} to each player: ${card.title}`, 'card');
      finishActionPhase(state, playerId);
      break;
    }

    case 'go_to_jail':
      sendToJail(state, playerId);
      finishActionPhase(state, playerId);
      break;

    case 'lose_turn':
      player.skippedTurns += 1;
      logEvent(state, playerId, `${player.name} loses their next turn: ${card.title}`, 'card');
      finishActionPhase(state, playerId);
      break;

    case 'keep_card':
      player.hasEscapeCard = true;
      logEvent(state, playerId, `${player.name} got an Escape NCAA Investigation card!`, 'card');
      finishActionPhase(state, playerId);
      break;

    case 'per_unit_fine': {
      let fine = 0;
      for (const pid of player.ownedPropertyIds) {
        const p = state.properties[pid];
        if (!p) continue;
        fine += p.houses * eff.amountPerHouse;
        if (p.hasHotel) fine += eff.amountPerHotel;
      }
      player.cash -= fine;
      logEvent(state, playerId, `${player.name} paid ${formatMoney(fine)} in violations: ${card.title}`, 'card');
      finishActionPhase(state, playerId);
      break;
    }

    case 'per_deed_fine': {
      const fine = player.ownedPropertyIds.length * eff.amountPerDeed;
      player.cash -= fine;
      logEvent(state, playerId, `${player.name} paid ${formatMoney(fine)}: ${card.title}`, 'card');
      finishActionPhase(state, playerId);
      break;
    }

    case 'lose_house': {
      // Remove one house from their cheapest program
      const withHouses = player.ownedPropertyIds.filter(pid => {
        const p = state.properties[pid];
        return p && p.type === 'property' && p.houses > 0;
      });
      if (withHouses.length > 0) {
        const pid = withHouses[0];
        state.properties[pid].houses -= 1;
        logEvent(state, playerId, `${player.name} lost a Recruiting Class on ${state.properties[pid].name}`, 'card');
      }
      logEvent(state, playerId, `${player.name}: ${card.title}`, 'card');
      finishActionPhase(state, playerId);
      break;
    }

    case 'choice':
      state.pendingAction = { type: 'CARD_CHOICE', data: { card, playerId } };
      state.phase = 'WAITING_FOR_CARD_CHOICE';
      break;

    case 'conditional_collect': {
      const hasGroup = (eff.groups || []).some(g =>
        ownsFullGroup(state, g, playerId)
      );
      const amount = hasGroup ? eff.ifTrue : eff.ifFalse;
      player.cash += amount;
      logEvent(state, playerId, `${player.name} collected ${formatMoney(amount)}: ${card.title}`, 'card');
      finishActionPhase(state, playerId);
      break;
    }

    case 'educational_moment':
      logEvent(state, playerId, `HISTORICAL MOMENT: ${card.historicalNote}`, 'card');
      finishActionPhase(state, playerId);
      break;

    case 'integration_bonus':
      state.pendingAction = { type: 'CARD_CHOICE', data: { card, playerId } };
      state.phase = 'WAITING_FOR_CARD_CHOICE';
      break;

    default:
      finishActionPhase(state, playerId);
  }

  return { needsLandingResolution: false, events };
}

// ─── rollDice (main turn action) ─────────────────────────────────────────────

function rollDiceAction(state, playerId) {
  const player = state.players[playerId];

  // Jail roll
  if (player.isJailed) {
    const dice = _roll();
    state.lastDiceRoll = dice;
    state.lastRolledDoubles = false;
    const isDoubles = dice.die1 === dice.die2;

    if (isDoubles) {
      player.isJailed = false;
      player.jailTurnsRemaining = 0;
      player.consecutiveDoubles = 0;
      advanceSpaces(state, playerId, dice.die1 + dice.die2);
      logEvent(state, playerId, `${player.name} rolled doubles (${dice.die1}+${dice.die2}) — out of NCAA Probation!`, 'jail');
      return { dice, isDoubles, grantsBonusRoll: false, ...resolveLanding(state, playerId) };
    } else {
      player.jailTurnsRemaining -= 1;
      if (player.jailTurnsRemaining <= 0) {
        // Force pay
        player.cash -= JAIL_FINE;
        player.isJailed = false;
        player.jailTurnsRemaining = 0;
        advanceSpaces(state, playerId, dice.die1 + dice.die2);
        logEvent(state, playerId, `${player.name} paid $50K fine — released from NCAA Probation`, 'jail');
        return { dice, isDoubles, grantsBonusRoll: false, ...resolveLanding(state, playerId) };
      }
      logEvent(state, playerId, `${player.name} rolled ${dice.die1}+${dice.die2} — still in Probation (${player.jailTurnsRemaining} turns left)`, 'jail');
      finishActionPhase(state, playerId);
      return { dice, isDoubles, grantsBonusRoll: false, events: [] };
    }
  }

  // Jail decision pending
  if (player.isJailed) {
    state.phase = 'WAITING_FOR_JAIL_DECISION';
    return { events: [] };
  }

  const dice = _roll();
  state.lastDiceRoll = dice;
  const isDoubles = dice.die1 === dice.die2;
  state.lastRolledDoubles = false;

  if (isDoubles) {
    player.consecutiveDoubles += 1;
    if (player.consecutiveDoubles >= 3) {
      sendToJail(state, playerId);
      logEvent(state, playerId, `${player.name} rolled 3 doubles in a row — sent to NCAA Probation!`, 'jail');
      finishActionPhase(state, playerId);
      return { dice, isDoubles, grantsBonusRoll: false, events: [] };
    }
    state.lastRolledDoubles = true;
  } else {
    player.consecutiveDoubles = 0;
  }

  const steps = dice.die1 + dice.die2;
  advanceSpaces(state, playerId, steps);
  logEvent(state, playerId, `${player.name} rolled ${dice.die1}+${dice.die2}=${steps} → landed on ${BOARD_SPACES[player.position].name || ''}`, 'move');

  return { dice, isDoubles, grantsBonusRoll: state.lastRolledDoubles, ...resolveLanding(state, playerId) };
}

// ─── resolveLanding ───────────────────────────────────────────────────────────

function resolveLanding(state, playerId) {
  const player = state.players[playerId];
  const space  = BOARD_SPACES[player.position];
  const events = [];

  switch (space.type) {
    case 'go':
      // Already collected on passing
      finishActionPhase(state, playerId);
      break;

    case 'free_parking':
    case 'jail_visit':
      finishActionPhase(state, playerId);
      break;

    case 'go_to_jail':
      sendToJail(state, playerId);
      finishActionPhase(state, playerId);
      break;

    case 'tax_income': {
      const flatAmt    = INCOME_TAX_FLAT;
      const pctAmt     = Math.floor(calculateTotalAssets(state, playerId) * 0.10);
      state.pendingAction = { type: 'PAY_TAX', data: { flatAmt, pctAmt, playerId } };
      state.phase = 'WAITING_FOR_TAX_CHOICE';
      break;
    }

    case 'tax_luxury':
      player.cash -= LUXURY_TAX;
      logEvent(state, playerId, `${player.name} paid ${formatMoney(LUXURY_TAX)} Stadium Renovation Tax`, 'tax');
      finishActionPhase(state, playerId);
      break;

    case 'card_gridiron': {
      const card = drawFromDeck(state, 'gridiron');
      events.push({ type: 'card_drawn', deck: 'gridiron', card });
      const { needsLandingResolution } = applyCardEffect(state, playerId, card);
      if (needsLandingResolution) {
        return resolveLanding(state, playerId);
      }
      break;
    }

    case 'card_commissioners': {
      const card = drawFromDeck(state, 'commissioners');
      events.push({ type: 'card_drawn', deck: 'commissioners', card });
      const { needsLandingResolution } = applyCardEffect(state, playerId, card);
      if (needsLandingResolution) {
        return resolveLanding(state, playerId);
      }
      break;
    }

    case 'property':
    case 'bowl_game':
    case 'tv_contract': {
      const prop = state.properties[space.propertyId];
      if (!prop) { finishActionPhase(state, playerId); break; }

      if (!prop.ownerId) {
        // Unowned — offer to buy
        state.pendingAction = {
          type: 'BUY_DECISION',
          data: { propertyId: space.propertyId, price: prop.price },
        };
        state.phase = 'WAITING_FOR_BUY_DECISION';
      } else if (prop.ownerId === playerId) {
        finishActionPhase(state, playerId);
      } else if (prop.isMortgaged) {
        finishActionPhase(state, playerId);
      } else {
        // Pay rent
        let rent = calculateRent(state, space.propertyId);
        if (state._cardDoubleRent) {
          rent *= 2;
          delete state._cardDoubleRent;
        }
        const paid = transferCash(state, playerId, prop.ownerId, rent);
        logEvent(state, playerId,
          `${player.name} paid ${formatMoney(paid)} rent to ${state.players[prop.ownerId].name} for ${prop.name}`,
          'rent');
        finishActionPhase(state, playerId);
        // Check if payer is bankrupt
        if (state.players[playerId].cash < 0) {
          return { events, bankruptPlayerId: playerId, creditorId: prop.ownerId };
        }
      }
      break;
    }

    default:
      finishActionPhase(state, playerId);
  }

  return { events };
}

// ─── buyProperty ─────────────────────────────────────────────────────────────

function buyProperty(state, playerId) {
  if (state.phase !== 'WAITING_FOR_BUY_DECISION') return { error: 'Not in buy phase' };
  const pending = state.pendingAction;
  if (!pending || pending.data.playerId !== undefined && pending.data.playerId !== playerId) {
    // allow current player
  }

  const { propertyId, price } = pending.data;
  const player = state.players[playerId];
  const prop   = state.properties[propertyId];

  if (player.cash < price) return { error: 'Not enough cash' };

  player.cash -= price;
  prop.ownerId = playerId;
  player.ownedPropertyIds.push(propertyId);
  state.pendingAction = null;
  finishActionPhase(state, playerId);

  logEvent(state, playerId, `${player.name} bought ${prop.name} for ${formatMoney(price)}`, 'purchase');
  return { events: [] };
}

// ─── declineBuy → startAuction ────────────────────────────────────────────────

function declineBuy(state, playerId) {
  if (state.phase !== 'WAITING_FOR_BUY_DECISION') return { error: 'Not in buy phase' };
  const { propertyId } = state.pendingAction.data;
  const prop = state.properties[propertyId];

  logEvent(state, playerId, `${state.players[playerId].name} declined to buy ${prop.name} — auction starting`, 'auction');

  return startAuction(state, propertyId);
}

function startAuction(state, propertyId) {
  const activePlayers = getActivePlayers(state);
  state.activeAuction = {
    propertyId,
    currentBid:     0,
    leadingBidder:  null,
    passedPlayers:  [],
    activeBidders:  [...activePlayers],
    startTime:      Date.now(),
  };
  state.pendingAction = null;
  state.phase = 'AUCTION_IN_PROGRESS';
  return { events: [{ type: 'auction_started', propertyId, propertyData: state.properties[propertyId] }] };
}

function processBid(state, playerId, amount) {
  const auction = state.activeAuction;
  if (!auction) return { error: 'No active auction' };
  if (!auction.activeBidders.includes(playerId)) return { error: 'Not an active bidder' };
  if (amount <= auction.currentBid) return { error: 'Bid must exceed current bid' };
  if (state.players[playerId].cash < amount) return { error: 'Not enough cash' };

  auction.currentBid    = amount;
  auction.leadingBidder = playerId;

  logEvent(state, playerId,
    `${state.players[playerId].name} bids ${formatMoney(amount)} for ${state.properties[auction.propertyId].name}`,
    'auction');

  return { events: [{ type: 'auction_updated', currentBid: amount, leadingBidder: playerId }] };
}

function passAuction(state, playerId) {
  const auction = state.activeAuction;
  if (!auction) return { error: 'No active auction' };

  auction.passedPlayers.push(playerId);
  auction.activeBidders = auction.activeBidders.filter(id => id !== playerId);

  logEvent(state, playerId, `${state.players[playerId].name} passed on the auction`, 'auction');

  // Check if only one bidder left (the leader) or all passed
  const remaining = auction.activeBidders.filter(id => id !== auction.leadingBidder);
  if (remaining.length === 0) {
    return resolveAuction(state);
  }

  return { events: [{ type: 'auction_updated', passedPlayers: auction.passedPlayers }] };
}

function resolveAuction(state) {
  const auction = state.activeAuction;
  const prop    = state.properties[auction.propertyId];

  if (auction.leadingBidder && auction.currentBid > 0) {
    const winner = state.players[auction.leadingBidder];
    winner.cash -= auction.currentBid;
    prop.ownerId = auction.leadingBidder;
    winner.ownedPropertyIds.push(auction.propertyId);
    logEvent(state, auction.leadingBidder,
      `${winner.name} won auction for ${prop.name} at ${formatMoney(auction.currentBid)}`,
      'auction');
  } else {
    logEvent(state, null, `No bids — ${prop.name} returned to the Bank`, 'auction');
  }

  state.activeAuction = null;
  finishActionPhase(state, auction.leadingBidder || state.playerOrder[state.currentPlayerIndex]);
  return { events: [{ type: 'auction_ended', winner: auction.leadingBidder, finalBid: auction.currentBid }] };
}

// ─── resolveIncomeTax ─────────────────────────────────────────────────────────

function resolveIncomeTax(state, playerId, choice) {
  const player   = state.players[playerId];
  const assets   = calculateTotalAssets(state, playerId);
  const pct      = Math.floor(assets * 0.10);
  const amount   = choice === 'flat' ? INCOME_TAX_FLAT : Math.min(INCOME_TAX_FLAT, pct);

  player.cash -= amount;
  logEvent(state, playerId, `${player.name} paid ${formatMoney(amount)} Program Expenses (${choice === 'flat' ? 'flat rate' : '10%'})`, 'tax');
  state.pendingAction = null;
  finishActionPhase(state, playerId);
  return { events: [] };
}

// ─── resolveJailDecision ──────────────────────────────────────────────────────

function resolveJailDecision(state, playerId, decision) {
  const player = state.players[playerId];

  if (decision === 'pay') {
    if (player.cash < JAIL_FINE) return { error: 'Not enough cash to pay fine' };
    player.cash -= JAIL_FINE;
    player.isJailed = false;
    player.jailTurnsRemaining = 0;
    logEvent(state, playerId, `${player.name} paid $50K fine — released from NCAA Probation`, 'jail');
    state.phase = 'WAITING_FOR_ROLL';
    return { events: [] };
  }

  if (decision === 'card') {
    if (!player.hasEscapeCard) return { error: 'No escape card' };
    player.hasEscapeCard = false;
    player.isJailed = false;
    player.jailTurnsRemaining = 0;
    logEvent(state, playerId, `${player.name} used Escape NCAA Investigation card`, 'jail');
    state.phase = 'WAITING_FOR_ROLL';
    return { events: [] };
  }

  return { error: 'Unknown jail decision' };
}

// ─── buildHouse / buildHotel ─────────────────────────────────────────────────

function buildHouse(state, playerId, propertyId) {
  const player = state.players[playerId];
  const prop   = state.properties[propertyId];
  if (!prop || prop.ownerId !== playerId) return { error: 'You do not own this program' };
  if (prop.type !== 'property') return { error: 'Can only build on programs, not Bowl Games or TV Contracts' };
  if (prop.isMortgaged) return { error: 'Program is mortgaged' };
  if (!ownsFullGroup(state, prop.group, playerId)) return { error: 'Must own all programs in the era group to build' };
  if (anyMortgagedInGroup(state, prop.group)) return { error: 'Cannot build while any program in the group is mortgaged' };
  if (prop.hasHotel) return { error: 'Already has a Stadium Expansion' };
  if (prop.houses >= 4) return { error: 'Maximum Recruiting Classes reached (4)' };

  // Even building rule: cannot add to this prop if it has more houses than the min in the group
  const minH = minHousesInGroup(state, prop.group);
  if (prop.houses > minH) return { error: 'Must build evenly across all programs in the group' };

  const def  = PROPERTIES[propertyId];
  const cost = def.buildCost;
  if (player.cash < cost) return { error: 'Not enough cash' };

  player.cash -= cost;
  prop.houses += 1;

  logEvent(state, playerId,
    `${player.name} added a Recruiting Class to ${prop.name} (${prop.houses}/4)`,
    'build');
  return { events: [] };
}

function buildHotel(state, playerId, propertyId) {
  const player = state.players[playerId];
  const prop   = state.properties[propertyId];
  if (!prop || prop.ownerId !== playerId) return { error: 'You do not own this program' };
  if (prop.type !== 'property') return { error: 'Can only build Stadium Expansions on programs' };
  if (prop.isMortgaged) return { error: 'Program is mortgaged' };
  if (!ownsFullGroup(state, prop.group, playerId)) return { error: 'Must own full era group' };
  if (anyMortgagedInGroup(state, prop.group)) return { error: 'Cannot build while any program in group is mortgaged' };
  if (prop.hasHotel) return { error: 'Already has a Stadium Expansion' };

  const maxH = state.shortGame ? 3 : 4;
  if (prop.houses < maxH) return { error: `Need ${maxH} Recruiting Classes first` };

  // Even check: all other props in group must also have maxH houses or hotel
  const groupIds = PROPERTY_GROUPS[prop.group] || [];
  for (const pid of groupIds) {
    if (pid === propertyId) continue;
    const other = state.properties[pid];
    if (!other.hasHotel && other.houses < maxH) {
      return { error: 'Must build evenly — other programs in group need more Recruiting Classes first' };
    }
  }

  const def  = PROPERTIES[propertyId];
  const cost = def.buildCost; // hotel costs same as one more house
  if (player.cash < cost) return { error: 'Not enough cash' };

  player.cash -= cost;
  prop.houses  = 0;
  prop.hasHotel = true;

  logEvent(state, playerId, `${player.name} built a Stadium Expansion at ${prop.name}!`, 'build');
  return { events: [] };
}

function sellHouse(state, playerId, propertyId) {
  const player = state.players[playerId];
  const prop   = state.properties[propertyId];
  if (!prop || prop.ownerId !== playerId) return { error: 'You do not own this program' };
  if (prop.houses === 0) return { error: 'No Recruiting Classes to sell' };

  // Even selling: cannot sell from this prop if it has fewer houses than the max
  const maxH = maxHousesInGroup(state, prop.group);
  if (prop.houses < maxH) return { error: 'Must sell evenly — sell from higher-development programs first' };

  const def = PROPERTIES[propertyId];
  const refund = Math.floor(def.buildCost / 2);
  player.cash += refund;
  prop.houses -= 1;

  logEvent(state, playerId, `${player.name} sold a Recruiting Class from ${prop.name} for ${formatMoney(refund)}`, 'build');
  return { events: [] };
}

function sellHotel(state, playerId, propertyId) {
  const player = state.players[playerId];
  const prop   = state.properties[propertyId];
  if (!prop || prop.ownerId !== playerId) return { error: 'You do not own this program' };
  if (!prop.hasHotel) return { error: 'No Stadium Expansion to sell' };

  const def    = PROPERTIES[propertyId];
  const refund = Math.floor(def.buildCost / 2);
  player.cash += refund;
  prop.hasHotel = false;
  prop.houses   = 4; // revert to 4 recruiting classes

  logEvent(state, playerId, `${player.name} sold Stadium Expansion at ${prop.name} for ${formatMoney(refund)}`, 'build');
  return { events: [] };
}

// ─── mortgage / unmortgage ────────────────────────────────────────────────────

function mortgageProperty(state, playerId, propertyId) {
  const player = state.players[playerId];
  const prop   = state.properties[propertyId];
  if (!prop || prop.ownerId !== playerId) return { error: 'You do not own this program' };
  if (prop.isMortgaged) return { error: 'Already mortgaged' };

  // Must sell all buildings in group first
  const groupIds = PROPERTY_GROUPS[prop.group] || [];
  for (const pid of groupIds) {
    const p = state.properties[pid];
    if (p && (p.houses > 0 || p.hasHotel)) {
      return { error: 'Sell all buildings in this era group before mortgaging' };
    }
  }

  prop.isMortgaged = true;
  player.cash += prop.mortgageValue;
  logEvent(state, playerId, `${player.name} mortgaged ${prop.name} for ${formatMoney(prop.mortgageValue)}`, 'mortgage');
  return { events: [] };
}

function unmortgageProperty(state, playerId, propertyId) {
  const player = state.players[playerId];
  const prop   = state.properties[propertyId];
  if (!prop || prop.ownerId !== playerId) return { error: 'You do not own this program' };
  if (!prop.isMortgaged) return { error: 'Not mortgaged' };

  const cost = Math.floor(prop.mortgageValue * 1.1);
  if (player.cash < cost) return { error: 'Not enough cash to lift mortgage' };

  player.cash -= cost;
  prop.isMortgaged = false;
  logEvent(state, playerId, `${player.name} lifted mortgage on ${prop.name} for ${formatMoney(cost)}`, 'mortgage');
  return { events: [] };
}

// ─── trade ───────────────────────────────────────────────────────────────────

function proposeTrade(state, fromId, toId, offer, request) {
  const tradeId = `trade_${Date.now()}`;
  state.activeTrade = { tradeId, fromId, toId, offer, request };
  logEvent(state, fromId, `${state.players[fromId].name} proposed a trade to ${state.players[toId].name}`, 'trade');
  return { tradeId, events: [] };
}

function acceptTrade(state, playerId) {
  const trade = state.activeTrade;
  if (!trade || trade.toId !== playerId) return { error: 'No active trade for you' };

  const from = state.players[trade.fromId];
  const to   = state.players[trade.toId];

  // Transfer cash
  from.cash -= (trade.offer.cash || 0);
  to.cash   += (trade.offer.cash || 0);
  to.cash   -= (trade.request.cash || 0);
  from.cash += (trade.request.cash || 0);

  // Transfer offered properties (from → to)
  for (const pid of (trade.offer.propertyIds || [])) {
    const prop = state.properties[pid];
    prop.ownerId = trade.toId;
    from.ownedPropertyIds = from.ownedPropertyIds.filter(id => id !== pid);
    to.ownedPropertyIds.push(pid);
  }

  // Transfer requested properties (to → from)
  for (const pid of (trade.request.propertyIds || [])) {
    const prop = state.properties[pid];
    prop.ownerId = trade.fromId;
    to.ownedPropertyIds = to.ownedPropertyIds.filter(id => id !== pid);
    from.ownedPropertyIds.push(pid);
  }

  logEvent(state, playerId, `Trade accepted between ${from.name} and ${to.name}`, 'trade');
  state.activeTrade = null;
  return { events: [] };
}

function rejectTrade(state, playerId) {
  if (!state.activeTrade) return { error: 'No active trade' };
  const { fromId } = state.activeTrade;
  logEvent(state, playerId, `${state.players[playerId].name} rejected the trade`, 'trade');
  state.activeTrade = null;
  return { events: [] };
}

// ─── bankruptcy ───────────────────────────────────────────────────────────────

function declareBankruptcy(state, bankruptId, creditorId) {
  const bankrupt = state.players[bankruptId];
  bankrupt.isActive = false;

  if (creditorId) {
    // Transfer everything to creditor
    const creditor = state.players[creditorId];
    creditor.cash += bankrupt.cash;
    for (const pid of bankrupt.ownedPropertyIds) {
      const prop = state.properties[pid];
      // Sell buildings at half price to bank, proceeds to creditor
      if (prop.hasHotel) {
        const def = PROPERTIES[pid];
        creditor.cash += Math.floor(def.buildCost / 2);
        prop.hasHotel = false;
      }
      if (prop.houses > 0) {
        const def = PROPERTIES[pid];
        creditor.cash += prop.houses * Math.floor(def.buildCost / 2);
        prop.houses = 0;
      }
      prop.ownerId = creditorId;
      creditor.ownedPropertyIds.push(pid);
    }
    if (bankrupt.hasEscapeCard) {
      creditor.hasEscapeCard = true;
    }
  } else {
    // Bank gets properties, auction them
    for (const pid of bankrupt.ownedPropertyIds) {
      const prop = state.properties[pid];
      prop.ownerId = null;
      prop.houses  = 0;
      prop.hasHotel = false;
      prop.isMortgaged = false;
    }
  }

  bankrupt.cash = 0;
  bankrupt.ownedPropertyIds = [];
  bankrupt.hasEscapeCard = false;

  logEvent(state, bankruptId,
    `${bankrupt.name} has gone bankrupt — eliminated from the game!`,
    'bankruptcy');

  return checkGameOver(state);
}

// ─── checkGameOver ────────────────────────────────────────────────────────────

function checkGameOver(state) {
  const active = getActivePlayers(state);
  if (active.length <= 1) {
    state.gameOver = true;
    state.winner   = active[0] || null;
    state.phase    = 'GAME_OVER';
    const winner   = state.winner ? state.players[state.winner].name : 'Nobody';
    logEvent(state, state.winner, `GAME OVER — ${winner} wins!`, 'general');
    return { gameOver: true, winner: state.winner, events: [] };
  }
  return { gameOver: false, events: [] };
}

// ─── endTurn ──────────────────────────────────────────────────────────────────

function endTurn(state, playerId) {
  if (state.phase !== 'TURN_ACTIONS_COMPLETE') return { error: 'Cannot end turn now' };

  const player = state.players[playerId];

  // If rolled doubles and not in jail, get another turn
  if (state.lastRolledDoubles && !player.isJailed) {
    state.phase = 'WAITING_FOR_ROLL';
    logEvent(state, playerId, `${player.name} rolled doubles — bonus turn!`, 'move');
    return { events: [] };
  }

  // Advance to next active player
  let nextIndex = state.currentPlayerIndex;
  let attempts  = 0;
  do {
    nextIndex = (nextIndex + 1) % state.playerOrder.length;
    attempts++;
  } while (!state.players[state.playerOrder[nextIndex]].isActive && attempts < state.playerOrder.length);

  state.currentPlayerIndex = nextIndex;
  state.lastDiceRoll       = null;
  state.lastRolledDoubles  = false;

  const nextPlayer = state.players[state.playerOrder[nextIndex]];

  // Handle skipped turns (WWII card)
  if (nextPlayer.skippedTurns > 0) {
    nextPlayer.skippedTurns -= 1;
    logEvent(state, nextPlayer.id, `${nextPlayer.name}'s turn was skipped (WWII Draft)`, 'general');
    return endTurn(state, nextPlayer.id); // recursive skip
  }

  state.phase = nextPlayer.isJailed ? 'WAITING_FOR_JAIL_DECISION' : 'WAITING_FOR_ROLL';
  state.turnNumber += 1;

  logEvent(state, nextPlayer.id, `It's ${nextPlayer.name}'s turn`, 'general');
  return { events: [] };
}

// ─── resolveCardChoice ────────────────────────────────────────────────────────

function resolveCardChoice(state, playerId, choiceIndex, extraData) {
  const pending = state.pendingAction;
  if (!pending || pending.type !== 'CARD_CHOICE') return { error: 'No card choice pending' };

  const { card } = pending.data;
  const eff = card.effect;

  if (eff.type === 'choice') {
    const chosen = eff.choices[choiceIndex];
    if (!chosen) return { error: 'Invalid choice' };
    const originalPending = state.pendingAction;
    const result = applyCardEffect(state, playerId, { ...card, effect: chosen.effect });
    // Only clear the original choice if the selected effect did not enqueue a follow-up action.
    if (state.pendingAction === originalPending) {
      state.pendingAction = null;
    }
    return result;
  }

  if (eff.type === 'integration_bonus') {
    // extraData.propertyId = chosen program
    const { propertyId } = extraData || {};
    if (propertyId && state.properties[propertyId]?.ownerId === playerId) {
      if (!state.players[playerId].revenueBonus) state.players[playerId].revenueBonus = {};
      state.players[playerId].revenueBonus[propertyId] = (state.players[playerId].revenueBonus[propertyId] || 0) + eff.amount;
      logEvent(state, playerId,
        `${state.players[playerId].name} integrated ${state.properties[propertyId].name} — permanent $300M revenue bonus!`,
        'card');
    }
    state.pendingAction = null;
    finishActionPhase(state, playerId);
    return { events: [] };
  }

  return { error: 'Unknown card choice type' };
}

module.exports = {
  rollDiceAction,
  resolveLanding,
  buyProperty,
  declineBuy,
  startAuction,
  processBid,
  passAuction,
  resolveAuction,
  resolveIncomeTax,
  resolveJailDecision,
  buildHouse,
  buildHotel,
  sellHouse,
  sellHotel,
  mortgageProperty,
  unmortgageProperty,
  proposeTrade,
  acceptTrade,
  rejectTrade,
  declareBankruptcy,
  checkGameOver,
  endTurn,
  resolveCardChoice,
  calculateTotalAssets,
  sendToJail,
};
