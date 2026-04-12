import React, { useEffect, useRef, useState } from 'react';
import socket from '../../socket.js';
import { formatMoney, GROUP_COLORS, GROUP_LABELS } from '../../utils.js';

export default function PlayerPanel({ gameState, playerId, roomCode }) {
  const [expanded, setExpanded] = useState(() => window.innerWidth >= 768);
  const [chatMessage, setChatMessage] = useState('');
  const chatFeedRef = useRef(null);

  if (!gameState) return null;

  const me        = gameState.players?.[playerId];
  const allPlayers = gameState.playerOrder?.map(id => gameState.players[id]) || [];
  const totalCash = allPlayers.reduce((sum, player) => sum + (player?.cash || 0), 0);
  const chatMessages = gameState.chatMessages || [];

  if (!me) return null;

  // Group my properties by era
  const myProps = (me.ownedPropertyIds || []).map(pid => gameState.properties[pid]).filter(Boolean);
  const grouped = {};
  for (const prop of myProps) {
    if (!grouped[prop.group]) grouped[prop.group] = [];
    grouped[prop.group].push(prop);
  }

  useEffect(() => {
    if (!chatFeedRef.current) return;
    chatFeedRef.current.scrollTop = chatFeedRef.current.scrollHeight;
  }, [chatMessages]);

  function sendChatMessage(event) {
    event.preventDefault();
    const trimmed = chatMessage.trim();
    if (!trimmed) return;
    socket.emit('send_chat_message', { roomCode, message: trimmed });
    setChatMessage('');
  }

  return (
    <div className="player-panel">
      <div className="player-panel-top">
        <div className="player-panel-brand">
          <div className="player-panel-brand-icon">🏈</div>
          <div className="player-panel-brand-copy">
            <div className="player-panel-brand-label">League Economy</div>
            <div className="player-panel-brand-value">{formatMoney(totalCash)}</div>
          </div>
        </div>

        <div className="player-panel-bar" onClick={() => setExpanded(e => !e)}>
          <div className="ppanel-token" style={{ backgroundColor: me.tokenColor }}>
            {me.name.substring(0, 2).toUpperCase()}
          </div>
          <div className="ppanel-info">
            <div className="ppanel-name">{me.name}</div>
            <div className="ppanel-cash">{formatMoney(me.cash)}</div>
          </div>
          {me.isJailed && <div className="ppanel-badge ppanel-badge-jail">IN PROBATION</div>}
          {me.hasEscapeCard && <div className="ppanel-badge ppanel-badge-escape">ESCAPE CARD</div>}
          <div className="ppanel-expand">{expanded ? '▲' : '▼'}</div>
        </div>
      </div>

      {/* Expanded: all players + my properties */}
      {expanded && (
        <div className="player-panel-expanded">
          {/* All players summary */}
          <div className="ppanel-all-players">
            <div className="ppanel-section-title">ALL PLAYERS</div>
            {allPlayers.map(p => (
              <div key={p.id} className={`ppanel-player-row ${!p.isActive ? 'ppanel-player-bankrupt' : ''}`}>
                <div className="ppanel-dot" style={{ backgroundColor: p.tokenColor }} />
                <span className="ppanel-pname">{p.name} {p.id === playerId ? '(you)' : ''}</span>
                <span className="ppanel-pmoney">{formatMoney(p.cash)}</span>
                <span className="ppanel-pprops">{p.ownedPropertyIds?.length || 0} props</span>
                {!p.isActive && <span className="ppanel-bankrupt-label">OUT</span>}
              </div>
            ))}
          </div>

          {/* My properties */}
          {myProps.length > 0 && (
            <div className="ppanel-my-props">
              <div className="ppanel-section-title">MY PROGRAMS</div>
              {Object.entries(grouped).map(([group, props]) => (
                <div key={group} className="ppanel-group">
                  <div
                    className="ppanel-group-header"
                    style={{ borderLeftColor: GROUP_COLORS[group] }}
                  >
                    {GROUP_LABELS[group] || group}
                  </div>
                  {props.map(prop => (
                    <div key={prop.id} className="ppanel-prop-row">
                      <div
                        className="ppanel-prop-dot"
                        style={{ backgroundColor: GROUP_COLORS[prop.group] }}
                      />
                      <span className="ppanel-prop-name">{prop.name}</span>
                      {prop.isMortgaged && <span className="ppanel-prop-tag tag-mortgaged">MORT.</span>}
                      {prop.hasHotel && <span className="ppanel-prop-tag tag-hotel">STAD.</span>}
                      {prop.houses > 0 && !prop.hasHotel && (
                        <span className="ppanel-prop-tag tag-houses">{prop.houses}RC</span>
                      )}
                      <PropActions prop={prop} playerId={playerId} roomCode={roomCode} gameState={gameState} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          <div className="ppanel-chat">
            <div className="ppanel-section-title">ROOM CHAT</div>
            <div className="ppanel-chat-feed" ref={chatFeedRef}>
              {chatMessages.length === 0 && (
                <div className="ppanel-chat-empty">No messages yet.</div>
              )}
              {chatMessages.map((entry) => (
                <div
                  key={entry.id}
                  className={`ppanel-chat-message ${entry.playerId === playerId ? 'ppanel-chat-message-mine' : ''}`}
                >
                  <div className="ppanel-chat-meta">
                    <span
                      className="ppanel-chat-dot"
                      style={{ backgroundColor: entry.tokenColor }}
                    />
                    <span className="ppanel-chat-name">{entry.playerName}</span>
                  </div>
                  <div className="ppanel-chat-text">{entry.message}</div>
                </div>
              ))}
            </div>

            <form className="ppanel-chat-form" onSubmit={sendChatMessage}>
              <input
                className="ppanel-chat-input"
                type="text"
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                maxLength={280}
                placeholder="Send a message..."
              />
              <button className="btn btn-primary ppanel-chat-send" type="submit">Send</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function PropActions({ prop, playerId, roomCode, gameState }) {
  const phase = gameState?.phase;
  if (phase !== 'TURN_ACTIONS_COMPLETE') return null;
  const isMyTurn = gameState?.playerOrder?.[gameState?.currentPlayerIndex] === playerId;
  if (!isMyTurn) return null;

  return (
    <div className="prop-action-btns">
      {!prop.isMortgaged && prop.type === 'property' && (
        <button
          className="prop-btn"
          onClick={(e) => { e.stopPropagation(); socket.emit('build_house', { roomCode, propertyId: prop.id }); }}
          title="Add Recruiting Class"
        >+RC</button>
      )}
      {prop.houses === 4 && !prop.hasHotel && prop.type === 'property' && (
        <button
          className="prop-btn prop-btn-hotel"
          onClick={(e) => { e.stopPropagation(); socket.emit('build_hotel', { roomCode, propertyId: prop.id }); }}
          title="Build Stadium Expansion"
        >STAD</button>
      )}
      {!prop.isMortgaged && (
        <button
          className="prop-btn prop-btn-mortgage"
          onClick={(e) => { e.stopPropagation(); socket.emit('mortgage_property', { roomCode, propertyId: prop.id }); }}
          title="Mortgage"
        >MORT</button>
      )}
      {prop.isMortgaged && (
        <button
          className="prop-btn prop-btn-unmortgage"
          onClick={(e) => { e.stopPropagation(); socket.emit('unmortgage_property', { roomCode, propertyId: prop.id }); }}
          title="Lift Mortgage"
        >LIFT</button>
      )}
    </div>
  );
}
