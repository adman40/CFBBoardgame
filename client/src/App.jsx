import React, { useState, useEffect } from 'react';
import socket from './socket.js';
import HomeScreen  from './screens/HomeScreen.jsx';
import LobbyScreen from './screens/LobbyScreen.jsx';
import GameScreen  from './screens/GameScreen.jsx';

export default function App() {
  const [screen, setScreen]       = useState('home');    // 'home' | 'lobby' | 'game'
  const [roomCode, setRoomCode]   = useState('');
  const [playerId, setPlayerId]   = useState('');
  const [players, setPlayers]     = useState([]);
  const [hostId, setHostId]       = useState('');
  const [gameState, setGameState] = useState(null);

  useEffect(() => {
    socket.on('room_created', ({ roomCode: code, playerId: pid }) => {
      setRoomCode(code);
      setPlayerId(pid);
      setHostId(pid);
      setScreen('lobby');
    });

    socket.on('room_joined', ({ playerId: pid, roomCode: code }) => {
      setPlayerId(pid);
      setRoomCode(code);
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

    socket.on('error', ({ message }) => {
      alert(`Error: ${message}`);
    });

    return () => {
      socket.off('room_created');
      socket.off('room_joined');
      socket.off('room_updated');
      socket.off('game_started');
      socket.off('state_update');
      socket.off('error');
    };
  }, []);

  if (screen === 'home') {
    return <HomeScreen />;
  }

  if (screen === 'lobby') {
    return (
      <LobbyScreen
        roomCode={roomCode}
        playerId={playerId}
        players={players}
        hostId={hostId}
      />
    );
  }

  if (screen === 'game' && gameState) {
    return (
      <GameScreen
        gameState={gameState}
        playerId={playerId}
        roomCode={roomCode}
      />
    );
  }

  return null;
}
