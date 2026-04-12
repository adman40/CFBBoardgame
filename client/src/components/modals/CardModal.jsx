import React from 'react';

const DECK_STYLES = {
  gridiron:       { header: '#1a4d0e', label: 'GRIDIRON EVENTS', icon: '📜' },
  commissioners:  { header: '#1a3a5c', label: "COMMISSIONER'S OFFICE", icon: '🏛️' },
};

export default function CardModal({ card, onDismiss }) {
  if (!card) return null;

  const style = DECK_STYLES[card.deck] || DECK_STYLES.gridiron;

  return (
    <div className="modal-overlay" onClick={onDismiss}>
      <div className="modal-card card-modal" onClick={e => e.stopPropagation()}>
        <div className="card-modal-header" style={{ backgroundColor: style.header }}>
          <span className="card-modal-icon">{style.icon}</span>
          <span className="card-modal-deck-label">{style.label}</span>
        </div>

        <div className="card-modal-body">
          <h2 className="card-modal-title">{card.card?.title || card.title}</h2>
          <p className="card-modal-description">{card.card?.description || card.description}</p>

          {(card.card?.historicalNote || card.historicalNote) && (
            <blockquote className="card-modal-history">
              <span className="history-label">HISTORICAL NOTE</span>
              {card.card?.historicalNote || card.historicalNote}
            </blockquote>
          )}
        </div>

        <div className="card-modal-footer">
          <button className="btn btn-primary" onClick={onDismiss}>
            GOT IT
          </button>
        </div>
      </div>
    </div>
  );
}
