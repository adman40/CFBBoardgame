import React, { useEffect, useRef, useState } from 'react';
import socket from '../socket.js';
import Board        from '../components/board/Board.jsx';
import ActionPanel  from '../components/panels/ActionPanel.jsx';
import PlayerPanel  from '../components/panels/PlayerPanel.jsx';
import CardModal    from '../components/modals/CardModal.jsx';
import BuyModal     from '../components/modals/BuyModal.jsx';
import AuctionModal from '../components/modals/AuctionModal.jsx';
import JailModal    from '../components/modals/JailModal.jsx';
import TaxModal     from '../components/modals/TaxModal.jsx';
import TradeModal   from '../components/modals/TradeModal.jsx';
import WinnerModal  from '../components/modals/WinnerModal.jsx';
import CardChoiceModal from '../components/modals/CardChoiceModal.jsx';

const ROLL_ANIMATION_MS = 1200;
const DICE_TICK_MS = 90;

function randomDieFace() {
  return Math.floor(Math.random() * 6) + 1;
}

export default function GameScreen({ gameState, playerId, roomCode }) {
  const [displayState, setDisplayState]   = useState(gameState);
  const [lastCard, setLastCard]           = useState(null);
  const [diceAnim, setDiceAnim]           = useState(null);
  const [isRollingVisual, setIsRollingVisual] = useState(false);
  const [tradeOffer, setTradeOffer]       = useState(null);
  const [winnerData, setWinnerData]       = useState(null);
  const [bankruptAnnounce, setBankrupt]   = useState(null);

  const pendingStateRef = useRef(null);
  const pendingCardRef = useRef(null);
  const rollIntervalRef = useRef(null);
  const rollTimeoutRef = useRef(null);
  const isRollingRef = useRef(false);

  useEffect(() => {
    if (!gameState) return;

    if (isRollingRef.current) {
      pendingStateRef.current = gameState;
      return;
    }

    setDisplayState(gameState);
  }, [gameState]);

  useEffect(() => {
    function finishRollAnimation(finalDice) {
      if (rollIntervalRef.current) {
        clearInterval(rollIntervalRef.current);
        rollIntervalRef.current = null;
      }
      if (rollTimeoutRef.current) {
        clearTimeout(rollTimeoutRef.current);
        rollTimeoutRef.current = null;
      }

      isRollingRef.current = false;
      setIsRollingVisual(false);
      setDiceAnim({ ...finalDice, rolling: false });

      if (pendingStateRef.current) {
        setDisplayState(pendingStateRef.current);
        pendingStateRef.current = null;
      }

      if (pendingCardRef.current) {
        setLastCard(pendingCardRef.current);
        pendingCardRef.current = null;
      }
    }

    function startRollAnimation(data) {
      if (rollIntervalRef.current) clearInterval(rollIntervalRef.current);
      if (rollTimeoutRef.current) clearTimeout(rollTimeoutRef.current);

      isRollingRef.current = true;
      setIsRollingVisual(true);
      setDiceAnim({
        die1: randomDieFace(),
        die2: randomDieFace(),
        isDoubles: false,
        playerId: data.playerId,
        rolling: true,
      });

      rollIntervalRef.current = setInterval(() => {
        setDiceAnim({
          die1: randomDieFace(),
          die2: randomDieFace(),
          isDoubles: false,
          playerId: data.playerId,
          rolling: true,
        });
      }, DICE_TICK_MS);

      rollTimeoutRef.current = setTimeout(() => {
        finishRollAnimation(data);
      }, ROLL_ANIMATION_MS);
    }

    socket.on('card_drawn', (data) => {
      if (isRollingRef.current) {
        pendingCardRef.current = data;
        return;
      }
      setLastCard(data);
    });

    socket.on('dice_rolled', (data) => {
      startRollAnimation(data);
    });

    socket.on('trade_proposed', (data) => {
      setTradeOffer(data);
    });

    socket.on('game_over', (data) => {
      setWinnerData(data);
    });

    socket.on('bankruptcy_declared', (data) => {
      setBankrupt(data);
      setTimeout(() => setBankrupt(null), 4000);
    });

    return () => {
      if (rollIntervalRef.current) clearInterval(rollIntervalRef.current);
      if (rollTimeoutRef.current) clearTimeout(rollTimeoutRef.current);
      socket.off('card_drawn');
      socket.off('dice_rolled');
      socket.off('trade_proposed');
      socket.off('game_over');
      socket.off('bankruptcy_declared');
    };
  }, []);

  const activeState = displayState || gameState;
  const me = activeState?.players?.[playerId];
  const isMyTurn = activeState?.playerOrder?.[activeState?.currentPlayerIndex] === playerId;

  if (!activeState || !me) return <div className="loading">Loading game...</div>;

  const phase = activeState.phase;
  const showBuyModal     = phase === 'WAITING_FOR_BUY_DECISION' && isMyTurn;
  const showTaxModal     = phase === 'WAITING_FOR_TAX_CHOICE'   && isMyTurn;
  const showJailModal    = phase === 'WAITING_FOR_JAIL_DECISION' && isMyTurn && me.isJailed;
  const showCardChoice   = phase === 'WAITING_FOR_CARD_CHOICE'  && isMyTurn;
  const showAuction      = phase === 'AUCTION_IN_PROGRESS';

  return (
    <div className="game-screen">
      <div className="game-layout">
        <div className="game-sidebar">
          <PlayerPanel gameState={activeState} playerId={playerId} roomCode={roomCode} />
          <ActionPanel
            gameState={activeState}
            playerId={playerId}
            roomCode={roomCode}
            isMyTurn={isMyTurn}
            diceAnim={diceAnim}
            isRollingVisual={isRollingVisual}
          />
        </div>

        <div className="game-board-area">
          <Board
            gameState={activeState}
            playerId={playerId}
            roomCode={roomCode}
            diceAnim={diceAnim}
            isRollingVisual={isRollingVisual}
          />
        </div>
      </div>

      {/* ── Modals ── */}
      {lastCard && (
        <CardModal
          card={lastCard}
          onDismiss={() => setLastCard(null)}
        />
      )}

      {showBuyModal && (
        <BuyModal
          gameState={activeState}
          playerId={playerId}
          roomCode={roomCode}
        />
      )}

      {showTaxModal && (
        <TaxModal
          gameState={activeState}
          playerId={playerId}
          roomCode={roomCode}
        />
      )}

      {showJailModal && (
        <JailModal
          gameState={activeState}
          playerId={playerId}
          roomCode={roomCode}
        />
      )}

      {showCardChoice && (
        <CardChoiceModal
          gameState={activeState}
          playerId={playerId}
          roomCode={roomCode}
        />
      )}

      {showAuction && (
        <AuctionModal
          gameState={activeState}
          playerId={playerId}
          roomCode={roomCode}
        />
      )}

      {tradeOffer && (
        <TradeModal
          offer={tradeOffer}
          roomCode={roomCode}
          onClose={() => setTradeOffer(null)}
        />
      )}

      {winnerData && (
        <WinnerModal
          data={winnerData}
          playerId={playerId}
          gameState={activeState}
        />
      )}

      {bankruptAnnounce && (
        <div className="bankrupt-toast">
          💀 {activeState.players[bankruptAnnounce.playerId]?.name} has gone bankrupt!
        </div>
      )}
    </div>
  );
}
