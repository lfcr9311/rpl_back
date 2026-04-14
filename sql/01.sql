CREATE TABLE IF NOT EXISTS NotamReadState (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  numero_notam TEXT NOT NULL,
  fir TEXT,
  lido BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_NotamReadState_source_numero
  ON NotamReadState (source_id, numero_notam);

CREATE INDEX IF NOT EXISTS ix_NotamReadState_fir
  ON NotamReadState (fir);