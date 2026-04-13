import React, { useState, useEffect } from 'react';
import socket from './socket.js';
import HomeScreen  from './screens/HomeScreen.jsx';
import LobbyScreen from './screens/LobbyScreen.jsx';
import GameScreen  from './screens/GameScreen.jsx';

const SESSION_STORAGE_KEY = 'cfb_session';

function loadStoredSession() {
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_error) {
    return null;
  }
}

function storeSession(session) {
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

function clearSession() {
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}

export default function App() {
  const [screen, setScreen]       = useState('home');    // 'home' | 'lobby' | 'game'
  const [roomCode, setRoomCode]   = useState('');
  const [playerId, setPlayerId]   = useState('');
  const [players, setPlayers]     = useState([]);
  const [hostId, setHostId]       = useState('');
  const [gameState, setGameState] = useState(null);
  const [restoreError, setRestoreError] = useState('');

  const joinCodeFromUrl = new URLSearchParams(window.location.search).get('join')?.toUpperCase() || '';

  useEffect(() => {
    function tryResumeSession() {
      const saved = loadStoredSession();
      if (!saved?.roomCode || !saved?.playerId || !saved?.reconnectToken) return;
      socket.emit('resume_session', saved);
    }

    socket.on('connect', tryResumeSession);

    socket.on('room_created', ({ roomCode: code, playerId: pid, playerName, reconnectToken, players: pl, hostId: hid }) => {
      setRoomCode(code);
      setPlayerId(pid);
      setPlayers(pl || []);
      setHostId(hid || pid);
      setGameState(null);
      setRestoreError('');
      storeSession({ roomCode: code, playerId: pid, playerName, reconnectToken });
      setScreen('lobby');
    });

    socket.on('room_joined', ({ playerId: pid, roomCode: code, playerName, reconnectToken, players: pl, hostId: hid }) => {
      setPlayerId(pid);
      setRoomCode(code);
      setPlayers(pl || []);
      setHostId(hid || '');
      setGameState(null);
      setRestoreError('');
      storeSession({ roomCode: code, playerId: pid, playerName, reconnectToken });
      setScreen('lobby');
    });

    socket.on('room_updated', ({ players: pl, hostId: hid }) => {
      setPlayers(pl);
      setHostId(hid);
    });

    socket.on('game_started', (state) => {
      setGameState(state);
      setScreen('game');
    });

    socket.on('state_update', (state) => {
      setGameState(state);
    });

    socket.on('session_resumed', ({ screen: restoredScreen, roomCode: code, playerId: pid, playerName, players: pl, hostId: hid, state }) => {
      const saved = loadStoredSession();
      storeSession({
        roomCode: code,
        playerId: pid,
        playerName,
        reconnectToken: saved?.reconnectToken,
      });

      setRoomCode(code);
      setPlayerId(pid);
      setRestoreError('');

      if (restoredScreen === 'game') {
        setGameState(state);
        setScreen('game');
      } else {
        setPlayers(pl || []);
        setHostId(hid || '');
        setGameState(null);
        setScreen('lobby');
      }
    });

    socket.on('left_game', () => {
      clearSession();
      setScreen('home');
      setRoomCode('');
      setPlayerId('');
      setPlayers([]);
      setHostId('');
      setGameState(null);
      setRestoreError('');
      socket.disconnect();
      socket.connect();
    });

    socket.on('error', ({ message }) => {
      if (message === 'Session not found' || message === 'Room expired' || message === 'Room not found') {
        clearSession();
        setScreen('home');
        setGameState(null);
        setPlayers([]);
        setHostId('');
        setPlayerId('');
        setRoomCode('');
        setRestoreError(message);
        return;
      }
      alert(`Error: ${message}`);
    });

    tryResumeSession();

    return () => {
      socket.off('connect', tryResumeSession);
      socket.off('room_created');
      socket.off('room_joined');
      socket.off('room_updated');
      socket.off('game_started');
      socket.off('state_update');
      socket.off('session_resumed');
      socket.off('left_game');
      socket.off('error');
    };
  }, []);

  function leaveGame() {
    if (!roomCode) {
      clearSession();
      setScreen('home');
      return;
    }
    socket.emit('leave_game', { roomCode });
  }

  if (screen === 'home') {
    return <HomeScreen initialJoinCode={joinCodeFromUrl} initialName={loadStoredSession()?.playerName || ''} restoreError={restoreError} />;
  }

  if (screen === 'lobby') {
    return (
      <LobbyScreen
        roomCode={roomCode}
        playerId={playerId}
        players={players}
        hostId={hostId}
        onLeave={leaveGame}
      />
    );
  }

  if (screen === 'game' && gameState) {
    return (
      <GameScreen
        gameState={gameState}
        playerId={playerId}
        roomCode={roomCode}
        onLeave={leaveGame}
      />
    );
  }

  return null;
}
