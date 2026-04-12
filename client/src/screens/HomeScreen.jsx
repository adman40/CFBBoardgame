import React, { useState } from 'react';
import socket from '../socket.js';

export default function HomeScreen() {
  const [name, setName]       = useState('');
  const [code, setCode]       = useState('');
  const [mode, setMode]       = useState(null); // 'create' | 'join'

  function handleCreate() {
    if (!name.trim()) return alert('Enter your name first');
    socket.emit('create_room', { playerName: name.trim() });
  }

  function handleJoin() {
    if (!name.trim()) return alert('Enter your name first');
    if (!code.trim()) return alert('Enter a room code');
    socket.emit('join_room', { roomCode: code.toUpperCase().trim(), playerName: name.trim() });
  }

  function openRulebook() {
    window.open('/rulebook.html', '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="home-screen">
      <div className="home-card">
        <div className="home-logo">
          <div className="logo-icon">🏈</div>
          <h1 className="logo-title">FROM THE FIELD<br/>TO THE FORTUNE</h1>
          <p className="logo-subtitle">A College Football History Game</p>
        </div>

        <div className="home-form">
          <label className="field-label">YOUR NAME</label>
          <input
            className="text-input"
            type="text"
            placeholder="Enter your name..."
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={20}
            onKeyDown={e => { if (e.key === 'Enter' && mode === 'join') handleJoin(); }}
          />

          {!mode && (
            <>
              <div className="home-buttons">
                <button className="btn btn-primary" onClick={() => setMode('create')}>
                  CREATE ROOM
                </button>
                <button className="btn btn-secondary" onClick={() => setMode('join')}>
                  JOIN ROOM
                </button>
              </div>
              <button className="btn btn-ghost btn-rulebook" onClick={openRulebook}>
                HOW TO PLAY
              </button>
            </>
          )}

          {mode === 'create' && (
            <div className="mode-section">
              <button className="btn btn-primary btn-lg" onClick={handleCreate}>
                CREATE & START LOBBY
              </button>
              <button className="btn btn-ghost" onClick={() => setMode(null)}>Back</button>
            </div>
          )}

          {mode === 'join' && (
            <div className="mode-section">
              <label className="field-label">ROOM CODE</label>
              <input
                className="text-input text-input-code"
                type="text"
                placeholder="e.g. A3F7K2"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                maxLength={6}
                onKeyDown={e => { if (e.key === 'Enter') handleJoin(); }}
              />
              <button className="btn btn-primary btn-lg" onClick={handleJoin}>
                JOIN GAME
              </button>
              <button className="btn btn-ghost" onClick={() => setMode(null)}>Back</button>
            </div>
          )}
        </div>

        <p className="home-tagline">
          2–5 players · Scan QR code to join on your phone
        </p>
      </div>
    </div>
  );
}
