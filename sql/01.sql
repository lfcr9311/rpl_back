CREATE TABLE IF NOT EXISTS notam_read_state (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  numero_notam TEXT NOT NULL,
  fir TEXT,
  lido BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_notam_read_state_source_numero
  ON notam_read_state (source_id, numero_notam);

CREATE INDEX IF NOT EXISTS ix_notam_read_state_fir
  ON notam_read_state (fir);