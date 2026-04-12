import React from 'react';
import socket from '../../socket.js';
import { formatMoney } from '../../utils.js';

export default function TaxModal({ gameState, playerId, roomCode }) {
  const pending = gameState?.pendingAction;
  if (!pending || pending.type !== 'PAY_TAX') return null;

  const { flatAmt, pctAmt } = pending.data;
  const cheaper = Math.min(flatAmt, pctAmt);

  function choose(choice) {
    socket.emit('income_tax_choice', { roomCode, choice });
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card tax-modal">
        <div className="tax-modal-header">
          <div className="tax-icon">💸</div>
          <h2>PROGRAM EXPENSES</h2>
        </div>

        <div className="tax-modal-body">
          <p className="tax-desc">
            Your program has operating expenses to cover.
            Choose how much to pay — you must decide <strong>before calculating</strong>.
          </p>

          <div className="tax-options">
            <button className="btn btn-secondary tax-btn" onClick={() => choose('flat')}>
              <div className="tax-btn-amount">{formatMoney(flatAmt)}</div>
              <div className="tax-btn-label">Flat Rate</div>
              {flatAmt <= pctAmt && <div className="tax-btn-tag">CHEAPER</div>}
            </button>

            <button className="btn btn-secondary tax-btn" onClick={() => choose('percent')}>
              <div className="tax-btn-amount">{formatMoney(pctAmt)}</div>
              <div className="tax-btn-label">10% of Assets</div>
              {pctAmt < flatAmt && <div className="tax-btn-tag">CHEAPER</div>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
