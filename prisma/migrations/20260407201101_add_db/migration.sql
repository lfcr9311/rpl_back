-- CreateTable
CREATE TABLE "Notam" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalId" TEXT NOT NULL,
    "number" TEXT,
    "fir" TEXT,
    "location" TEXT,
    "qcode" TEXT,
    "category" TEXT,
    "dist" TEXT,
    "type" TEXT,
    "status" TEXT,
    "issuedAt" DATETIME,
    "validFrom" DATETIME,
    "validTo" DATETIME,
    "validFromRaw" TEXT,
    "validToRaw" TEXT,
    "dailyWindow" TEXT,
    "textE" TEXT,
    "lowerLimit" TEXT,
    "upperLimit" TEXT,
    "geoRaw" TEXT,
    "areaType" TEXT,
    "geometryType" TEXT,
    "centerLat" REAL,
    "centerLon" REAL,
    "radiusM" REAL,
    "coordsJson" JSONB,
    "rawPayload" JSONB,
    "isChecked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Airport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "icao" TEXT NOT NULL,
    "name" TEXT,
    "country" TEXT,
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL,
    "elevation" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Fix" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ident" TEXT NOT NULL,
    "name" TEXT,
    "country" TEXT,
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Airway" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "country" TEXT,
    "source" TEXT,
    "level" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AirwayPoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "airwayId" TEXT NOT NULL,
    "fixId" TEXT,
    "seq" INTEGER NOT NULL,
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AirwayPoint_airwayId_fkey" FOREIGN KEY ("airwayId") REFERENCES "Airway" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AirwayPoint_fixId_fkey" FOREIGN KEY ("fixId") REFERENCES "Fix" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ManualRoute" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "destino" TEXT NOT NULL,
    "rotaTexto" TEXT NOT NULL,
    "rawTokensJson" JSONB NOT NULL,
    "usedTokensJson" JSONB NOT NULL,
    "coordsJson" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RouteNotamDecision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "routeKey" TEXT NOT NULL,
    "routeIdent" TEXT,
    "origem" TEXT,
    "destino" TEXT,
    "notamId" TEXT NOT NULL,
    "manualRouteId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RouteNotamDecision_notamId_fkey" FOREIGN KEY ("notamId") REFERENCES "Notam" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RouteNotamDecision_manualRouteId_fkey" FOREIGN KEY ("manualRouteId") REFERENCES "ManualRoute" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Notam_externalId_key" ON "Notam"("externalId");

-- CreateIndex
CREATE INDEX "Notam_number_idx" ON "Notam"("number");

-- CreateIndex
CREATE INDEX "Notam_fir_idx" ON "Notam"("fir");

-- CreateIndex
CREATE INDEX "Notam_qcode_idx" ON "Notam"("qcode");

-- CreateIndex
CREATE INDEX "Notam_validFrom_idx" ON "Notam"("validFrom");

-- CreateIndex
CREATE INDEX "Notam_validTo_idx" ON "Notam"("validTo");

-- CreateIndex
CREATE UNIQUE INDEX "Airport_icao_key" ON "Airport"("icao");

-- CreateIndex
CREATE INDEX "Airport_icao_idx" ON "Airport"("icao");

-- CreateIndex
CREATE INDEX "Airport_country_idx" ON "Airport"("country");

-- CreateIndex
CREATE UNIQUE INDEX "Fix_ident_key" ON "Fix"("ident");

-- CreateIndex
CREATE INDEX "Fix_ident_idx" ON "Fix"("ident");

-- CreateIndex
CREATE INDEX "Fix_country_idx" ON "Fix"("country");

-- CreateIndex
CREATE INDEX "Airway_code_idx" ON "Airway"("code");

-- CreateIndex
CREATE INDEX "Airway_country_idx" ON "Airway"("country");

-- CreateIndex
CREATE INDEX "Airway_source_idx" ON "Airway"("source");

-- CreateIndex
CREATE UNIQUE INDEX "Airway_code_country_source_level_key" ON "Airway"("code", "country", "source", "level");

-- CreateIndex
CREATE INDEX "AirwayPoint_airwayId_idx" ON "AirwayPoint"("airwayId");

-- CreateIndex
CREATE INDEX "AirwayPoint_fixId_idx" ON "AirwayPoint"("fixId");

-- CreateIndex
CREATE UNIQUE INDEX "AirwayPoint_airwayId_seq_key" ON "AirwayPoint"("airwayId", "seq");

-- CreateIndex
CREATE INDEX "ManualRoute_origem_idx" ON "ManualRoute"("origem");

-- CreateIndex
CREATE INDEX "ManualRoute_destino_idx" ON "ManualRoute"("destino");

-- CreateIndex
CREATE INDEX "RouteNotamDecision_routeKey_idx" ON "RouteNotamDecision"("routeKey");

-- CreateIndex
CREATE INDEX "RouteNotamDecision_notamId_idx" ON "RouteNotamDecision"("notamId");

-- CreateIndex
CREATE INDEX "RouteNotamDecision_status_idx" ON "RouteNotamDecision"("status");

-- CreateIndex
CREATE UNIQUE INDEX "RouteNotamDecision_routeKey_notamId_key" ON "RouteNotamDecision"("routeKey", "notamId");
