import React from 'react';
import socket from '../../socket.js';
import { formatMoney } from '../../utils.js';

export default function JailModal({ gameState, playerId, roomCode }) {
  const me = gameState?.players?.[playerId];
  if (!me?.isJailed) return null;

  function payFine() {
    socket.emit('jail_pay_fine', { roomCode });
  }

  function useCard() {
    socket.emit('jail_use_card', { roomCode });
  }

  function rollForDoubles() {
    socket.emit('roll_dice', { roomCode });
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card jail-modal">
        <div className="jail-modal-header">
          <div className="jail-icon">🚫</div>
          <h2>NCAA PROBATION</h2>
          <p className="jail-turns">Turns remaining: {me.jailTurnsRemaining}</p>
        </div>

        <div className="jail-modal-body">
          <p className="jail-description">
            Your program is under investigation. You must resolve this before continuing.
          </p>

          <div className="jail-options">
            <div className="jail-option">
              <button className="btn btn-primary btn-lg" onClick={payFine}>
                PAY $50K FINE
              </button>
              <p className="jail-option-desc">
                Pay {formatMoney(50_000_000_000)} and continue your turn
              </p>
            </div>

            {me.hasEscapeCard && (
              <div className="jail-option">
                <button className="btn btn-success btn-lg" onClick={useCard}>
                  USE ESCAPE CARD
                </button>
                <p className="jail-option-desc">Use your Escape NCAA Investigation card</p>
              </div>
            )}

            <div className="jail-option">
              <button className="btn btn-secondary btn-lg" onClick={rollForDoubles}>
                ROLL FOR DOUBLES
              </button>
              <p className="jail-option-desc">
                Roll doubles to escape for free ({me.jailTurnsRemaining} {me.jailTurnsRemaining === 1 ? 'try' : 'tries'} left)
              </p>
            </div>
          </div>

          <blockquote className="jail-history">
            <strong>Historical Note:</strong> NCAA Probation is a real and serious penalty.
            Programs on probation face scholarship reductions, bowl bans, and recruiting restrictions.
            SMU received the "Death Penalty" in 1987 — a complete program suspension.
          </blockquote>
        </div>
      </div>
    </div>
  );
}
