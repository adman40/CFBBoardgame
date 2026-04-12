import React, { useState } from 'react';
import socket from '../../socket.js';
import { formatMoney, GROUP_COLORS } from '../../utils.js';

export default function AuctionModal({ gameState, playerId, roomCode }) {
  const [bidAmount, setBidAmount] = useState('');

  const auction = gameState?.activeAuction;
  if (!auction) return null;

  const prop    = gameState.properties?.[auction.propertyId];
  const me      = gameState.players?.[playerId];
  const leader  = auction.leadingBidder ? gameState.players[auction.leadingBidder] : null;
  const isPassed = auction.passedPlayers?.includes(playerId);
  const isActive = auction.activeBidders?.includes(playerId);

  function bid() {
    const amount = Number(bidAmount) * 1_000_000_000;
    if (!amount || amount <= auction.currentBid) {
      return alert(`Bid must be more than ${formatMoney(auction.currentBid)}`);
    }
    socket.emit('auction_bid', { roomCode, amount });
    setBidAmount('');
  }

  function pass() {
    socket.emit('auction_pass', { roomCode });
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card auction-modal">
        <div
          className="auction-modal-header"
          style={{ backgroundColor: GROUP_COLORS[prop?.group] || '#333' }}
        >
          <div className="auction-label">🔨 AUCTION</div>
          <div className="auction-prop-name">{prop?.name}</div>
        </div>

        <div className="auction-body">
          <div className="auction-current-bid">
            <div className="auction-bid-label">Current Bid</div>
            <div className="auction-bid-amount">
              {auction.currentBid > 0 ? formatMoney(auction.currentBid) : 'No bids yet'}
            </div>
            {leader && (
              <div className="auction-leader">
                Leading: <strong style={{ color: leader.tokenColor }}>{leader.name}</strong>
              </div>
            )}
          </div>

          <div className="auction-passed">
            {auction.passedPlayers?.length > 0 && (
              <div className="passed-list">
                Passed: {auction.passedPlayers.map(id => gameState.players[id]?.name).join(', ')}
              </div>
            )}
          </div>

          {isActive && !isPassed && (
            <div className="auction-actions">
              <div className="auction-bid-row">
                <input
                  type="number"
                  placeholder={`Min: ${Math.round((auction.currentBid + 1_000_000) / 1_000_000)}M`}
                  value={bidAmount}
                  onChange={e => setBidAmount(e.target.value)}
                  className="auction-bid-input"
                  min={Math.ceil((auction.currentBid + 1_000_000) / 1_000_000)}
                />
                <span className="auction-input-label">M</span>
              </div>
              <div className="auction-btns">
                <button className="btn btn-primary" onClick={bid}>BID</button>
                <button className="btn btn-secondary" onClick={pass}>PASS</button>
              </div>
            </div>
          )}

          {isPassed && (
            <div className="auction-passed-msg">You passed on this auction</div>
          )}

          {!isActive && !isPassed && (
            <div className="auction-watching-msg">Watching auction...</div>
          )}
        </div>
      </div>
    </div>
  );
}
