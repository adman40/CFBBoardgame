import React, { useState } from 'react';
import socket from '../../socket.js';

export default function CardChoiceModal({ gameState, playerId, roomCode }) {
  const [selectedProp, setSelectedProp] = useState('');
  const pending = gameState?.pendingAction;
  if (!pending || pending.type !== 'CARD_CHOICE') return null;

  const { card } = pending.data;
  const eff = card?.effect;
  const me  = gameState?.players?.[playerId];

  function choose(choiceIndex) {
    socket.emit('card_choice', { roomCode, choiceIndex });
  }

  function chooseIntegration() {
    if (!selectedProp) return alert('Select a program to integrate');
    socket.emit('card_choice', { roomCode, choiceIndex: 0, extraData: { propertyId: selectedProp } });
  }

  if (eff?.type === 'integration_bonus') {
    const myProps = (me?.ownedPropertyIds || [])
      .map(pid => gameState.properties?.[pid])
      .filter(Boolean);

    return (
      <div className="modal-overlay">
        <div className="modal-card choice-modal">
          <div className="choice-modal-header">
            <h2>{card.title}</h2>
          </div>
          <div className="choice-modal-body">
            <p>{card.description}</p>
            <blockquote className="card-modal-history">
              <span className="history-label">HISTORICAL NOTE</span>
              {card.historicalNote}
            </blockquote>
            <label className="choice-label">Choose a program to integrate:</label>
            <select
              value={selectedProp}
              onChange={e => setSelectedProp(e.target.value)}
              className="choice-select"
            >
              <option value="">— select program —</option>
              {myProps.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="choice-modal-actions">
            <button className="btn btn-primary" onClick={chooseIntegration}>
              INTEGRATE (+$300M permanent revenue)
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (eff?.type === 'choice') {
    return (
      <div className="modal-overlay">
        <div className="modal-card choice-modal">
          <div className="choice-modal-header">
            <h2>{card.title}</h2>
          </div>
          <div className="choice-modal-body">
            <p>{card.description}</p>
            <blockquote className="card-modal-history">
              <span className="history-label">HISTORICAL NOTE</span>
              {card.historicalNote}
            </blockquote>
          </div>
          <div className="choice-modal-actions">
            {eff.choices.map((choice, idx) => (
              <button
                key={idx}
                className={`btn ${idx === 0 ? 'btn-secondary' : 'btn-primary'}`}
                onClick={() => choose(idx)}
              >
                {choice.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
