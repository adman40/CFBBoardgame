import React, { useState } from 'react';
import socket from '../../socket.js';
export default function ActionPanel({ gameState, playerId, roomCode, isMyTurn }) {
  const [showTrade, setShowTrade] = useState(false);
  const [tradeTo, setTradeTo]     = useState('');
  const [tradeOfferCash, setTradeOfferCash]   = useState('');
  const [tradeRequestCash, setTradeRequestCash] = useState('');
  const [tradeOfferProps, setTradeOfferProps]   = useState([]);
  const [tradeRequestProps, setTradeRequestProps] = useState([]);

  if (!gameState) return null;

  const phase = gameState.phase;
  const me    = gameState.players?.[playerId];
  if (!me) return null;

  function endTurn() {
    socket.emit('end_turn', { roomCode });
  }

  function declareBankruptcy() {
    if (window.confirm('Declare bankruptcy and leave the game?')) {
      socket.emit('declare_bankruptcy', { roomCode });
    }
  }

  function sendTrade() {
    if (!tradeTo) return;
    socket.emit('propose_trade', {
      roomCode,
      targetPlayerId: tradeTo,
      offer:   { cash: Number(tradeOfferCash) || 0,   propertyIds: tradeOfferProps },
      request: { cash: Number(tradeRequestCash) || 0, propertyIds: tradeRequestProps },
    });
    setShowTrade(false);
  }

  const canEndTurn = isMyTurn && phase === 'TURN_ACTIONS_COMPLETE';
  const canTrade   = isMyTurn && phase === 'TURN_ACTIONS_COMPLETE';

  const myProps = (me.ownedPropertyIds || []).map(pid => gameState.properties?.[pid]).filter(Boolean);
  const otherPlayers = (gameState.playerOrder || [])
    .filter(id => id !== playerId && gameState.players[id]?.isActive)
    .map(id => gameState.players[id]);

  return (
    <div className="action-panel">
      <div className="action-row">
        {/* Main actions */}
        <div className="action-buttons">
          {canEndTurn && (
            <button className="btn btn-success btn-action" onClick={endTurn}>
              ✅ END TURN
            </button>
          )}

          {canTrade && !showTrade && (
            <button className="btn btn-secondary btn-action" onClick={() => setShowTrade(true)}>
              🤝 TRADE
            </button>
          )}

          {!isMyTurn && (
            <div className="action-waiting">
              Waiting for {gameState.players[gameState.playerOrder[gameState.currentPlayerIndex]]?.name}...
            </div>
          )}
        </div>

        {/* Bankruptcy button */}
        {isMyTurn && me.cash < 0 && (
          <button className="btn btn-danger btn-action" onClick={declareBankruptcy}>
            💀 DECLARE BANKRUPTCY
          </button>
        )}
      </div>

      {/* Trade form */}
      {showTrade && (
        <div className="trade-panel">
          <div className="trade-header">
            Propose Trade
            <button className="btn-close" onClick={() => setShowTrade(false)}>✕</button>
          </div>

          <div className="trade-row">
            <label>Trade with:</label>
            <select value={tradeTo} onChange={e => setTradeTo(e.target.value)}>
              <option value="">— select player —</option>
              {otherPlayers.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="trade-cols">
            <div className="trade-col">
              <div className="trade-col-header">YOU OFFER</div>
              <input
                type="number"
                placeholder="Cash ($M)"
                value={tradeOfferCash}
                onChange={e => setTradeOfferCash(e.target.value)}
                className="trade-cash-input"
              />
              <div className="trade-props-list">
                {myProps.map(p => (
                  <label key={p.id} className="trade-prop-check">
                    <input
                      type="checkbox"
                      checked={tradeOfferProps.includes(p.id)}
                      onChange={e => {
                        setTradeOfferProps(prev =>
                          e.target.checked ? [...prev, p.id] : prev.filter(x => x !== p.id)
                        );
                      }}
                    />
                    {p.name}
                  </label>
                ))}
              </div>
            </div>

            <div className="trade-col">
              <div className="trade-col-header">YOU REQUEST</div>
              <input
                type="number"
                placeholder="Cash ($M)"
                value={tradeRequestCash}
                onChange={e => setTradeRequestCash(e.target.value)}
                className="trade-cash-input"
              />
              <div className="trade-props-list">
                {tradeTo && (gameState.players[tradeTo]?.ownedPropertyIds || []).map(pid => {
                  const p = gameState.properties[pid];
                  return p ? (
                    <label key={pid} className="trade-prop-check">
                      <input
                        type="checkbox"
                        checked={tradeRequestProps.includes(pid)}
                        onChange={e => {
                          setTradeRequestProps(prev =>
                            e.target.checked ? [...prev, pid] : prev.filter(x => x !== pid)
                          );
                        }}
                      />
                      {p.name}
                    </label>
                  ) : null;
                })}
              </div>
            </div>
          </div>

          <button className="btn btn-primary" onClick={sendTrade} disabled={!tradeTo}>
            SEND TRADE OFFER
          </button>
        </div>
      )}
    </div>
  );
}
