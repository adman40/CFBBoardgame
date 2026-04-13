import React from 'react';
import socket from '../../socket.js';
import { formatMoney } from '../../utils.js';

export default function CenterPanel({ gameState, playerId, roomCode, diceAnim, isRollingVisual }) {
  if (!gameState) return null;

  const currentId  = gameState.playerOrder?.[gameState.currentPlayerIndex];
  const currentPl  = gameState.players?.[currentId];
  const me         = gameState.players?.[playerId];
  const isMyTurn   = currentId === playerId;
  const myCash     = me?.cash ?? 0;
  const myPrograms = me?.ownedPropertyIds?.length ?? 0;
  const canRoll    = isMyTurn && gameState.phase === 'WAITING_FOR_ROLL' && !isRollingVisual;
  const centerDice = diceAnim || gameState.lastDiceRoll;

  const recentLogs = (gameState.turnLog || []).slice(0, 5);

  function roll() {
    socket.emit('roll_dice', { roomCode });
  }

  return (
    <div className="center-panel">
      <div className="center-logo">
        <span className="center-logo-icon">🏈</span>
        <div className="center-logo-text">
          <div className="center-title">FIELD TO FORTUNE</div>
          <div className="center-sub">College Football History</div>
        </div>
      </div>

      {/* Dice display */}
      {centerDice && (
        <div className="center-dice">
          <div className={`die ${diceAnim?.rolling ? 'die-rolling' : ''}`}>{centerDice.die1}</div>
          <div className={`die ${diceAnim?.rolling ? 'die-rolling' : ''}`}>{centerDice.die2}</div>
        </div>
      )}

      <div className="center-roll-area">
        {canRoll && (
          <button className="btn btn-primary center-roll-btn" onClick={roll}>
            🎲 Roll Dice
          </button>
        )}
        {isRollingVisual && <div className="center-roll-status">Rolling...</div>}
        {!isRollingVisual && diceAnim?.isDoubles && <div className="center-roll-status center-roll-status-gold">Doubles! Roll again</div>}
      </div>

      <div className="center-stats">
        <div className="center-stat">
          <span className="center-stat-label">Cash</span>
          <span className="center-stat-value">{formatMoney(myCash)}</span>
        </div>
        <div className="center-stat">
          <span className="center-stat-label">Programs</span>
          <span className="center-stat-value">{myPrograms}</span>
        </div>
      </div>

      {/* Turn indicator */}
      <div className={`center-turn ${isMyTurn ? 'center-turn-mine' : ''}`}>
        {isMyTurn
          ? '🟢 YOUR TURN'
          : `⏳ ${currentPl?.name || '...'}'s turn`}
      </div>

      {/* Phase indicator */}
      <div className="center-phase">{phaseLabel(gameState.phase)}</div>

      {/* Turn log */}
      <div className="center-log">
        {recentLogs.map((entry, i) => (
          <div key={i} className={`log-entry log-${entry.type}`}>
            {entry.message}
          </div>
        ))}
      </div>
    </div>
  );
}

function phaseLabel(phase) {
  const labels = {
    WAITING_FOR_ROLL:         'Roll the dice',
    WAITING_FOR_BUY_DECISION: 'Buy or pass?',
    AUCTION_IN_PROGRESS:      '🔨 Auction in progress',
    WAITING_FOR_CARD_ACK:     'Draw a card',
    WAITING_FOR_TAX_CHOICE:   'Choose tax option',
    WAITING_FOR_JAIL_DECISION:'NCAA Probation options',
    WAITING_FOR_CARD_CHOICE:  'Make a choice',
    TURN_ACTIONS_COMPLETE:    'End turn or build/trade',
    GAME_OVER:                '🏆 Game Over!',
  };
  return labels[phase] || phase;
}
