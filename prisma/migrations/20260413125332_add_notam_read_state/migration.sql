-- CreateTable
CREATE TABLE "NotamReadState" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "numeroNotam" TEXT NOT NULL,
    "fir" TEXT,
    "lido" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotamReadState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotamReadState_lido_idx" ON "NotamReadState"("lido");

-- CreateIndex
CREATE INDEX "NotamReadState_numeroNotam_idx" ON "NotamReadState"("numeroNotam");

-- CreateIndex
CREATE INDEX "NotamReadState_sourceId_idx" ON "NotamReadState"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "NotamReadState_sourceId_numeroNotam_key" ON "NotamReadState"("sourceId", "numeroNotam");
