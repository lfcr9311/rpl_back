import { Injectable } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { DatabaseService } from '../config/database'

type SetReadStateInput = {
  sourceId?: string | null
  numeroNotam: string
  fir?: string | null
  lido: boolean
}

type NotamReadStateRow = {
  id: string
  sourceId: string
  numeroNotam: string
  fir: string | null
  lido: boolean
  createdAt: Date
  updatedAt: Date
}

@Injectable()
export class NotamReadStateService {
  constructor(private readonly db: DatabaseService) {}

  private normalizeString(value?: string | null): string {
    return String(value ?? '').trim()
  }

  private normalizeOptionalString(value?: string | null): string | undefined {
    const normalized = String(value ?? '').trim()
    return normalized.length > 0 ? normalized : undefined
  }

  private normalizeNumeroNotam(value: string): string {
    return String(value ?? '').trim().toUpperCase()
  }

  private buildSourceId(sourceId?: string | null, numeroNotam?: string, fir?: string) {
    const normalizedSourceId = this.normalizeOptionalString(sourceId)
    if (normalizedSourceId) {
      return normalizedSourceId
    }

    const normalizedNumeroNotam = this.normalizeNumeroNotam(numeroNotam ?? '')
    const normalizedFir = this.normalizeOptionalString(fir)?.toUpperCase() ?? ''

    return `ALT::${normalizedNumeroNotam}::${normalizedFir}`
  }

  async setReadState(input: SetReadStateInput) {
    const numeroNotam = this.normalizeNumeroNotam(input.numeroNotam)
    const fir = this.normalizeOptionalString(input.fir)?.toUpperCase() ?? null
    const sourceId = this.buildSourceId(input.sourceId, numeroNotam, fir ?? undefined)

    const sql = `
      INSERT INTO "NotamReadState" (
        "id",
        "sourceId",
        "numeroNotam",
        "fir",
        "lido",
        "createdAt",
        "updatedAt"
      )
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      ON CONFLICT ("sourceId", "numeroNotam")
      DO UPDATE SET
        "fir" = EXCLUDED."fir",
        "lido" = EXCLUDED."lido",
        "updatedAt" = NOW()
      RETURNING
        "id",
        "sourceId",
        "numeroNotam",
        "fir",
        "lido",
        "createdAt",
        "updatedAt"
    `

    const result = await this.db.query<NotamReadStateRow>(sql, [
      randomUUID(),
      sourceId,
      numeroNotam,
      fir,
      input.lido,
    ])

    return result.rows[0]
  }

  async listReadStates(fir?: string) {
    const normalizedFir = this.normalizeOptionalString(fir)?.toUpperCase()

    const sql = normalizedFir
      ? `
        SELECT
          "id",
          "sourceId",
          "numeroNotam",
          "fir",
          "lido",
          "createdAt",
          "updatedAt"
        FROM "NotamReadState"
        WHERE "fir" = $1
        ORDER BY "updatedAt" DESC
      `
      : `
        SELECT
          "id",
          "sourceId",
          "numeroNotam",
          "fir",
          "lido",
          "createdAt",
          "updatedAt"
        FROM "NotamReadState"
        ORDER BY "updatedAt" DESC
      `

    const result = await this.db.query<NotamReadStateRow>(
      sql,
      normalizedFir ? [normalizedFir] : [],
    )

    return result.rows
  }

  async getReadStates(fir?: string) {
    return this.listReadStates(fir)
  }

  async buildReadStateMap(fir?: string) {
    const rows = await this.listReadStates(fir)
    const map = new Map<string, boolean>()

    for (const row of rows) {
      const sourceId = this.normalizeString(row.sourceId)
      const numeroNotam = this.normalizeNumeroNotam(row.numeroNotam)
      const firValue = this.normalizeOptionalString(row.fir)?.toUpperCase() ?? ''

      if (sourceId.startsWith('ALT::')) {
        map.set(`ALT::${numeroNotam}::${firValue}`, row.lido)
      } else {
        map.set(`SRC::${sourceId}`, row.lido)
      }
    }

    return map
  }

  async getReadMap(fir?: string) {
    return this.buildReadStateMap(fir)
  }
}