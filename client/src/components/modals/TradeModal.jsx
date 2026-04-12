import React from 'react';
import socket from '../../socket.js';
import { formatMoney } from '../../utils.js';

export default function TradeModal({ offer, roomCode, onClose }) {
  if (!offer) return null;

  function accept() {
    socket.emit('accept_trade', { roomCode });
    onClose();
  }

  function reject() {
    socket.emit('reject_trade', { roomCode });
    onClose();
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card trade-modal">
        <div className="trade-modal-header">
          <h2>🤝 TRADE OFFER</h2>
          <p>From: <strong>{offer.fromPlayer}</strong></p>
        </div>

        <div className="trade-modal-body">
          <div className="trade-cols">
            <div className="trade-col">
              <div className="trade-col-header">THEY OFFER YOU</div>
              {offer.offer?.cash > 0 && (
                <div className="trade-item">{formatMoney(offer.offer.cash * 1_000_000_000)}</div>
              )}
              {(offer.offer?.propertyIds || []).map(pid => (
                <div key={pid} className="trade-item">{pid}</div>
              ))}
              {!offer.offer?.cash && !offer.offer?.propertyIds?.length && (
                <div className="trade-item-empty">Nothing</div>
              )}
            </div>

            <div className="trade-col">
              <div className="trade-col-header">THEY WANT</div>
              {offer.request?.cash > 0 && (
                <div className="trade-item">{formatMoney(offer.request.cash * 1_000_000_000)}</div>
              )}
              {(offer.request?.propertyIds || []).map(pid => (
                <div key={pid} className="trade-item">{pid}</div>
              ))}
              {!offer.request?.cash && !offer.request?.propertyIds?.length && (
                <div className="trade-item-empty">Nothing</div>
              )}
            </div>
          </div>
        </div>

        <div className="trade-modal-actions">
          <button className="btn btn-primary btn-lg" onClick={accept}>ACCEPT</button>
          <button className="btn btn-secondary btn-lg" onClick={reject}>REJECT</button>
        </div>
      </div>
    </div>
  );
}
