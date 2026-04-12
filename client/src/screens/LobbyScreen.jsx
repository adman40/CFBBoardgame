import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import socket from '../socket.js';

const TOKEN_COLORS = ['#E53E3E', '#3182CE', '#38A169', '#D69E2E', '#805AD5'];

export default function LobbyScreen({ roomCode, playerId, players, hostId }) {
  const isHost   = playerId === hostId;
  const joinUrl  = `${window.location.origin}?join=${roomCode}`;

  function handleStart() {
    socket.emit('start_game', { roomCode });
  }

  return (
    <div className="lobby-screen">
      <div className="lobby-header">
        <h1 className="lobby-title">FROM THE FIELD TO THE FORTUNE</h1>
        <p className="lobby-subtitle">Waiting for players...</p>
      </div>

      <div className="lobby-content">
        <div className="lobby-code-section">
          <p className="lobby-code-label">ROOM CODE</p>
          <div className="lobby-code">{roomCode}</div>
          <p className="lobby-code-hint">Share this code or scan the QR code to join</p>
          <div className="lobby-qr">
            <QRCodeSVG
              value={joinUrl}
              size={180}
              bgColor="#ffffff"
              fgColor="#1a4d0e"
              level="M"
            />
          </div>
        </div>

        <div className="lobby-players-section">
          <p className="lobby-players-label">PLAYERS ({players.length}/5)</p>
          <div className="lobby-players-list">
            {players.map((p, idx) => (
              <div key={p.id} className="lobby-player-row">
                <div
                  className="lobby-player-token"
                  style={{ backgroundColor: TOKEN_COLORS[idx] || '#888' }}
                >
                  {p.name.substring(0, 2).toUpperCase()}
                </div>
                <span className="lobby-player-name">{p.name}</span>
                {p.id === hostId && <span className="lobby-host-badge">HOST</span>}
                {p.id === playerId && <span className="lobby-you-badge">YOU</span>}
              </div>
            ))}

            {Array.from({ length: Math.max(0, 2 - players.length) }).map((_, i) => (
              <div key={`empty-${i}`} className="lobby-player-row lobby-player-empty">
                <div className="lobby-player-token lobby-player-token-empty">?</div>
                <span className="lobby-player-name-empty">Waiting...</span>
              </div>
            ))}
          </div>

          {isHost && (
            <div className="lobby-start-section">
              <button
                className="btn btn-primary btn-lg"
                onClick={handleStart}
                disabled={players.length < 2}
              >
                {players.length < 2 ? 'Need 2+ players to start' : 'START GAME'}
              </button>
              {players.length < 2 && (
                <p className="lobby-waiting-msg">Waiting for at least one more player...</p>
              )}
            </div>
          )}

          {!isHost && (
            <p className="lobby-waiting-msg">Waiting for the host to start the game...</p>
          )}
        </div>
      </div>

      <div className="lobby-rules-preview">
        <h3>Quick Rules</h3>
        <ul>
          <li>Collect $2M every time you pass <strong>Kickoff (GO)</strong></li>
          <li>Buy college football programs to collect revenue from opponents</li>
          <li>Own an entire era group to <strong>double your revenue</strong></li>
          <li>Build <strong>Recruiting Classes</strong> and <strong>Stadium Expansions</strong> for more income</li>
          <li>Draw <strong>Gridiron Events</strong> and <strong>Commissioner's Office</strong> cards for history lessons</li>
          <li>Last program standing wins!</li>
        </ul>
      </div>
    </div>
  );
}
