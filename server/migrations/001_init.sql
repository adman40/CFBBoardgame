CREATE TABLE IF NOT EXISTS rooms (
  room_code TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('lobby', 'active', 'finished', 'expired')),
  host_player_id TEXT NOT NULL,
  lobby_players_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  game_state_json JSONB,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  zero_connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS player_sessions (
  player_id TEXT PRIMARY KEY,
  room_code TEXT NOT NULL REFERENCES rooms(room_code) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  reconnect_token TEXT NOT NULL UNIQUE,
  last_socket_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_player_sessions_room_code
  ON player_sessions (room_code);

CREATE INDEX IF NOT EXISTS idx_rooms_last_activity
  ON rooms (last_activity_at);
