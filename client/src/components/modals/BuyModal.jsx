import React from 'react';
import socket from '../../socket.js';
import { formatMoney, GROUP_COLORS, GROUP_LABELS } from '../../utils.js';

export default function BuyModal({ gameState, playerId, roomCode }) {
  const pending = gameState?.pendingAction;
  if (!pending || pending.type !== 'BUY_DECISION') return null;

  const { propertyId, price } = pending.data;
  const prop = gameState.properties?.[propertyId];
  const me   = gameState.players?.[playerId];

  if (!prop || !me) return null;

  const canAfford = me.cash >= price;

  function buy() {
    socket.emit('buy_property', { roomCode });
  }

  function auction() {
    socket.emit('decline_buy', { roomCode });
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card buy-modal">
        <div
          className="buy-modal-header"
          style={{ backgroundColor: GROUP_COLORS[prop.group] || '#1a4d0e' }}
        >
          <div className="buy-modal-era">{GROUP_LABELS[prop.group] || 'Program'}</div>
          <div className="buy-modal-name">{prop.name}</div>
          <div className="buy-modal-price">{formatMoney(price)}</div>
        </div>

        <div className="buy-modal-body">
          {prop.historicalNote && (
            <p className="buy-modal-history">{prop.historicalNote}</p>
          )}

          <div className="buy-modal-rents">
            <div className="rent-row"><span>Base revenue:</span><span>{formatMoney(prop.rents?.[0])}</span></div>
            <div className="rent-row"><span>1 Recruiting Class:</span><span>{formatMoney(prop.rents?.[1])}</span></div>
            <div className="rent-row"><span>2 Recruiting Classes:</span><span>{formatMoney(prop.rents?.[2])}</span></div>
            <div className="rent-row"><span>3 Recruiting Classes:</span><span>{formatMoney(prop.rents?.[3])}</span></div>
            <div className="rent-row"><span>4 Recruiting Classes:</span><span>{formatMoney(prop.rents?.[4])}</span></div>
            {prop.type === 'property' && (
              <div className="rent-row rent-row-hotel"><span>Stadium Expansion:</span><span>{formatMoney(prop.rents?.[5])}</span></div>
            )}
          </div>

          <div className="buy-modal-balance">
            Your balance: <strong>{formatMoney(me.cash)}</strong>
            {!canAfford && <span className="buy-modal-warning"> (Not enough!)</span>}
          </div>
        </div>

        <div className="buy-modal-actions">
          <button
            className="btn btn-primary btn-lg"
            onClick={buy}
            disabled={!canAfford}
          >
            BUY — {formatMoney(price)}
          </button>
          <button className="btn btn-secondary" onClick={auction}>
            AUCTION IT
          </button>
        </div>
      </div>
    </div>
  );
}
