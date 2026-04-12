import React from 'react';
import BoardSpace  from './BoardSpace.jsx';
import CenterPanel from './CenterPanel.jsx';

// 40-space Monopoly-style board layout.
// The 11x11 grid has corners at (row,col): (11,11),(11,1),(1,1),(1,11)
// Bottom row: spaces 0-10  →  col 11 down to 1, row 11
// Right col:  spaces 11-19 →  col 11, row 10 down to 2
// Top row:    spaces 20-30 →  col 10 up to 1 (right to left), row 1
// Left col:   spaces 31-39 →  col 1, row 2 up to 10

function getGridPosition(spaceIndex) {
  if (spaceIndex >= 0 && spaceIndex <= 10) {
    // Bottom row: index 0 at col 11 (right corner), index 10 at col 1 (left corner)
    return { row: 11, col: 11 - spaceIndex, side: 'bottom' };
  }
  if (spaceIndex >= 11 && spaceIndex <= 19) {
    // Right col: going up from row 10 to row 2
    return { row: 10 - (spaceIndex - 11), col: 11, side: 'right' };
  }
  if (spaceIndex >= 20 && spaceIndex <= 30) {
    // Top row: right to left
    return { row: 1, col: 11 - (spaceIndex - 20), side: 'top' };
  }
  // Left col: going down from row 2 to row 10
  return { row: 2 + (spaceIndex - 31), col: 1, side: 'left' };
}

// Build space index → list of playerIds
function buildPlayerPositions(gameState) {
  const posMap = {};
  if (!gameState?.players) return posMap;
  for (const player of Object.values(gameState.players)) {
    if (!player.isActive) continue;
    const pos = player.position;
    if (!posMap[pos]) posMap[pos] = [];
    posMap[pos].push(player);
  }
  return posMap;
}

export default function Board({ gameState, playerId, roomCode, diceAnim, isRollingVisual }) {
  const playerPositions = buildPlayerPositions(gameState);

  return (
    <div className="board-wrapper">
      <div className="board-grid">
        {/* Center area */}
        <div
          className="board-center"
          style={{ gridArea: '2 / 2 / 11 / 11' }}
        >
          <CenterPanel
            gameState={gameState}
            playerId={playerId}
            roomCode={roomCode}
            diceAnim={diceAnim}
            isRollingVisual={isRollingVisual}
          />
        </div>

        {/* All 40 spaces */}
        {Array.from({ length: 40 }, (_, i) => {
          const { row, col, side } = getGridPosition(i);
          const propId = gameState?.properties
            ? Object.values(gameState.properties).find(p => p.spaceIndex === i)?.id
            : null;
          const propData = propId ? gameState.properties[propId] : null;
          const playersHere = playerPositions[i] || [];

          return (
            <div
              key={i}
              style={{
                gridRow: row,
                gridColumn: col,
              }}
            >
              <BoardSpace
                spaceIndex={i}
                propData={propData}
                playersHere={playersHere}
                side={side}
                currentPlayerId={playerId}
                gameState={gameState}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
