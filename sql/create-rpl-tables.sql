CREATE TABLE IF NOT EXISTS rpl_import_control (
  id UUID PRIMARY KEY,
  filename TEXT,
  total_flights INTEGER NOT NULL DEFAULT 0,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rpl_flight (
  id UUID PRIMARY KEY,

  flight_number TEXT NOT NULL,
  equipment TEXT,

  start_date DATE,
  end_date DATE,

  is_monday BOOLEAN NOT NULL DEFAULT FALSE,
  is_tuesday BOOLEAN NOT NULL DEFAULT FALSE,
  is_wednesday BOOLEAN NOT NULL DEFAULT FALSE,
  is_thursday BOOLEAN NOT NULL DEFAULT FALSE,
  is_friday BOOLEAN NOT NULL DEFAULT FALSE,
  is_saturday BOOLEAN NOT NULL DEFAULT FALSE,
  is_sunday BOOLEAN NOT NULL DEFAULT FALSE,

  departure TEXT NOT NULL,
  arrival TEXT NOT NULL,

  eobt TEXT,
  speed TEXT,
  flight_level TEXT,
  route TEXT,
  eet TEXT,
  eta TEXT,
  remarks TEXT,

  original_line TEXT,
  coords_latlon JSONB NOT NULL DEFAULT '[]'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rpl_flight_point (
  id UUID PRIMARY KEY,
  flight_id UUID NOT NULL REFERENCES rpl_flight(id) ON DELETE CASCADE,

  sequence INTEGER NOT NULL,
  ident TEXT NOT NULL,

  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,

  distance_accumulated_nm DOUBLE PRECISION NOT NULL DEFAULT 0,
  elapsed_minutes INTEGER NOT NULL DEFAULT 0,
  estimated_time TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rpl_flight_flight_number
ON rpl_flight(flight_number);

CREATE INDEX IF NOT EXISTS idx_rpl_flight_departure_arrival
ON rpl_flight(departure, arrival);

CREATE INDEX IF NOT EXISTS idx_rpl_flight_eobt
ON rpl_flight(eobt);

CREATE INDEX IF NOT EXISTS idx_rpl_flight_point_flight_id
ON rpl_flight_point(flight_id);

CREATE INDEX IF NOT EXISTS idx_rpl_flight_point_ident
ON rpl_flight_point(ident);