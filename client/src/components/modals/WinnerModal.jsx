import React from 'react';
import { formatMoney } from '../../utils.js';

export default function WinnerModal({ data, playerId, gameState }) {
  if (!data) return null;

  const isWinner = data.winner === playerId;
  const winner   = data.winner ? gameState?.players?.[data.winner] : null;

  function playAgain() {
    window.localStorage.removeItem('cfb_session');
    window.location.reload();
  }

  return (
    <div className="modal-overlay winner-overlay">
      <div className="modal-card winner-modal">
        <div className="winner-header">
          <div className="winner-trophy">🏆</div>
          <h1 className="winner-title">
            {isWinner ? 'YOU WIN!' : `${winner?.name || 'Someone'} Wins!`}
          </h1>
          <p className="winner-subtitle">
            The wealthiest college football empire in the South
          </p>
        </div>

        <div className="winner-body">
          <h3 className="leaderboard-title">FINAL STANDINGS</h3>
          <div className="leaderboard">
            {(data.leaderboard || []).map((entry, idx) => (
              <div
                key={entry.id}
                className={`leaderboard-row ${entry.id === playerId ? 'leaderboard-row-me' : ''} ${!entry.isActive ? 'leaderboard-row-bankrupt' : ''}`}
              >
                <div className="lb-rank">#{idx + 1}</div>
                <div
                  className="lb-token"
                  style={{ backgroundColor: gameState?.players?.[entry.id]?.tokenColor || '#888' }}
                >
                  {entry.name.substring(0, 2).toUpperCase()}
                </div>
                <div className="lb-name">
                  {entry.name}
                  {entry.id === playerId && ' (you)'}
                  {!entry.isActive && ' 💀'}
                </div>
                <div className="lb-assets">{formatMoney(entry.totalAssets)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="winner-footer">
          <p className="winner-quote">
            "Football is to the South what religion is to the soul — it is not what
            we do on Saturday. It is who we are."
          </p>
          <button className="btn btn-primary" onClick={playAgain}>
            PLAY AGAIN
          </button>
        </div>
      </div>
    </div>
  );
}
