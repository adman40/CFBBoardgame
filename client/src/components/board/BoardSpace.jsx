import React from 'react';

const SPACE_NAMES = {
  0:  'KICKOFF', 2:  "COMM.\nOFFICE", 4:  'PROGRAM\nEXPENSES',
  7:  'GRIDIRON\nEVENTS', 10: 'PROBATION', 17: "COMM.\nOFFICE",
  20: 'NIL\nSIGNING\nDAY', 22: 'GRIDIRON\nEVENTS', 30: 'GO TO\nPROBATION',
  33: "COMM.\nOFFICE", 36: 'GRIDIRON\nEVENTS', 38: 'STADIUM\nTAX',
};

const GROUP_COLORS = {
  brown:       '#8B4513',
  light_blue:  '#87CEEB',
  pink:        '#FF69B4',
  orange:      '#FF8C00',
  red:         '#DC143C',
  yellow:      '#DAA520',
  green:       '#228B22',
  dark_blue:   '#00008B',
  bowl_game:   '#8B008B',
  tv_contract: '#2F4F4F',
};

const SPACE_TYPE_COLORS = {
  go:               '#c8f7c5',
  free_parking:     '#fff9c4',
  jail_visit:       '#cce5ff',
  go_to_jail:       '#f8cecc',
  tax_income:       '#ffe0b2',
  tax_luxury:       '#ffe0b2',
  card_gridiron:    '#e8f5e9',
  card_commissioners: '#e3f2fd',
};

function buildingDots(prop) {
  if (!prop || prop.type !== 'property') return null;
  if (prop.hasHotel) return <div className="building-hotel">STAD</div>;
  if (prop.houses > 0) {
    return (
      <div className="building-houses">
        {Array.from({ length: prop.houses }, (_, i) => (
          <div key={i} className="building-dot" />
        ))}
      </div>
    );
  }
  return null;
}

export default function BoardSpace({ spaceIndex, propData, playersHere, side, currentPlayerId, gameState }) {
  const isCorner  = [0, 10, 20, 30].includes(spaceIndex);
  const colorBand = propData ? GROUP_COLORS[propData.group] : null;
  const bgColor   = propData
    ? '#faf7e8'
    : (SPACE_TYPE_COLORS[getSpaceType(spaceIndex)] || '#faf7e8');

  const displayName = propData
    ? shortName(propData.name)
    : (SPACE_NAMES[spaceIndex] || '');

  // Price label (for unowned properties)
  const priceLabel = propData && !propData.ownerId
    ? `$${Math.round(propData.price / 1_000_000)}M`
    : null;

  // Ownership indicator
  const ownerColor = propData?.ownerId ? getOwnerColor(propData.ownerId, gameState) : null;

  return (
    <div
      className={`board-space board-space-${side} ${isCorner ? 'board-space-corner' : ''} ${propData?.isMortgaged ? 'board-space-mortgaged' : ''}`}
      style={{ backgroundColor: bgColor }}
    >
      {/* Color band — top for bottom-row spaces, bottom for top-row, left/right for side cols */}
      {colorBand && (
        <div
          className={`color-band color-band-${side}`}
          style={{ backgroundColor: colorBand }}
        >
          {ownerColor && (
            <div
              className="owner-dot"
              style={{ backgroundColor: ownerColor, border: '1px solid white' }}
            />
          )}
        </div>
      )}

      <div className="space-content">
        <div className="space-name">{displayName}</div>
        {priceLabel && <div className="space-price">{priceLabel}</div>}
        {buildingDots(propData)}
        {propData?.ownerId && !propData?.isMortgaged && (
          <div className="space-owned-label">Owned</div>
        )}
      </div>

      {/* Player tokens */}
      {playersHere.length > 0 && (
        <div className="space-tokens">
          {playersHere.slice(0, 5).map((player) => (
            <div
              key={player.id}
              className={`player-token-dot ${player.id === currentPlayerId ? 'player-token-mine' : ''}`}
              style={{ backgroundColor: player.tokenColor }}
              title={player.name}
            >
              {player.name.substring(0, 1)}
            </div>
          ))}
        </div>
      )}

      {propData?.isMortgaged && <div className="mortgage-overlay">MORTGAGED</div>}
    </div>
  );
}

function shortName(name) {
  const shorts = {
    'Auburn Tigers':                  'AUBURN',
    'Vanderbilt Commodores':          'VANDY',
    'Georgia Tech':                   'GEORGIA\nTECH',
    'Tennessee Volunteers':           'TENN',
    'Georgia Bulldogs (Early Era)':   'GEORGIA',
    'LSU Tigers':                     'LSU',
    'Ole Miss Rebels':                'OLE\nMISS',
    'Mississippi State Bulldogs':     'MISS.\nSTATE',
    'Florida Gators':                 'FLORIDA',
    'South Carolina Gamecocks':       'S.\nCAR.',
    'Kentucky Wildcats':              'KENTUCKY',
    'Alabama Crimson Tide (Early Era)':'ALA. E.',
    'Arkansas Razorbacks':            'ARK.',
    'Texas Longhorns':                'TEXAS',
    'Florida State Seminoles':        'FLA.\nSTATE',
    'Miami Hurricanes':               'MIAMI',
    'Notre Dame Fighting Irish':      'NOTRE\nDAME',
    'Ohio State Buckeyes':            'OHIO\nSTATE',
    'USC Trojans':                    'USC',
    'Clemson Tigers':                 'CLEMSON',
    'Georgia Bulldogs (Modern Dynasty)': 'UGA',
    'Alabama Crimson Tide (Modern Dynasty)': 'BAMA',
    'Rose Bowl':                      'ROSE\nBOWL',
    'Sugar Bowl':                     'SUGAR\nBOWL',
    'Orange Bowl':                    'ORANGE\nBOWL',
    'Cotton Bowl':                    'COTTON\nBOWL',
    'CBS / SEC Network':              'CBS /\nSEC',
    'ESPN Contract':                  'ESPN',
  };
  return shorts[name] || name.substring(0, 8).toUpperCase();
}

function getSpaceType(index) {
  const types = {
    0: 'go', 2: 'card_commissioners', 4: 'tax_income', 7: 'card_gridiron',
    10: 'jail_visit', 17: 'card_commissioners', 20: 'free_parking',
    22: 'card_gridiron', 30: 'go_to_jail', 33: 'card_commissioners',
    36: 'card_gridiron', 38: 'tax_luxury',
  };
  return types[index] || '';
}

function getOwnerColor(ownerId, gameState) {
  return gameState?.players?.[ownerId]?.tokenColor || '#888';
}
