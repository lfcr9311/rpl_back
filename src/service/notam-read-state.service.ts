import { Injectable, Logger } from '@nestjs/common'
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
  source_id: string
  numero_notam: string
  fir: string | null
  lido: boolean
  created_at: Date
  updated_at: Date
}

@Injectable()
export class NotamReadStateService {
  private readonly logger = new Logger(NotamReadStateService.name)
  private readonly tableName = 'notam_read_state'

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

  private buildSourceId(input: {
    sourceId?: string | null
    numeroNotam: string
    fir?: string | null
  }): string {
    const explicitSourceId = this.normalizeOptionalString(input.sourceId)
    if (explicitSourceId) {
      return explicitSourceId
    }

    const numeroNotam = this.normalizeNumeroNotam(input.numeroNotam)
    const fir = this.normalizeOptionalString(input.fir)?.toUpperCase() ?? 'SEM_FIR'

    return `${numeroNotam}::${fir}`
  }

  private isRelationMissingError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false
    }

    const err = error as { code?: string }
    return err.code === '42P01'
  }

  private async ensureTableExists(): Promise<boolean> {
    try {
      const result = await this.db.query<{ exists: boolean }>(
        `
          SELECT EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = $1
          ) AS exists
        `,
        [this.tableName],
      )

      return !!result.rows[0]?.exists
    } catch (error) {
      this.logger.error('Erro ao verificar existência da tabela notam_read_state', error as Error)
      return false
    }
  }

  async setReadState(input: SetReadStateInput): Promise<void> {
    const tableExists = await this.ensureTableExists()

    if (!tableExists) {
      this.logger.warn(`Tabela ${this.tableName} não existe. Estado de leitura não será persistido.`)
      return
    }

    const numeroNotam = this.normalizeNumeroNotam(input.numeroNotam)
    const fir = this.normalizeOptionalString(input.fir)?.toUpperCase() ?? null
    const sourceId = this.buildSourceId({
      sourceId: input.sourceId,
      numeroNotam,
      fir,
    })

    const id = randomUUID()

    try {
      await this.db.query(
        `
          INSERT INTO notam_read_state (
            id,
            source_id,
            numero_notam,
            fir,
            lido
          )
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (source_id, numero_notam)
          DO UPDATE SET
            fir = EXCLUDED.fir,
            lido = EXCLUDED.lido,
            updated_at = NOW()
        `,
        [id, sourceId, numeroNotam, fir, input.lido],
      )
    } catch (error) {
      if (this.isRelationMissingError(error)) {
        this.logger.warn(`Tabela ${this.tableName} não existe. Ignorando persistência de leitura.`)
        return
      }

      this.logger.error('Erro ao salvar estado de leitura do NOTAM', error as Error)
      throw error
    }
  }

  async getReadStates(): Promise<NotamReadStateRow[]> {
    const tableExists = await this.ensureTableExists()

    if (!tableExists) {
      this.logger.warn(`Tabela ${this.tableName} não existe. Retornando lista vazia.`)
      return []
    }

    try {
      const result = await this.db.query<NotamReadStateRow>(
        `
          SELECT
            id,
            source_id,
            numero_notam,
            fir,
            lido,
            created_at,
            updated_at
          FROM notam_read_state
        `,
      )

      return result.rows
    } catch (error) {
      if (this.isRelationMissingError(error)) {
        this.logger.warn(`Tabela ${this.tableName} não existe. Retornando lista vazia.`)
        return []
      }

      this.logger.error('Erro ao listar estados de leitura', error as Error)
      throw error
    }
  }

  async buildReadStateMap(): Promise<Map<string, boolean>> {
    const rows = await this.getReadStates()
    const map = new Map<string, boolean>()

    for (const row of rows) {
      const sourceId = this.normalizeString(row.source_id)
      const numeroNotam = this.normalizeNumeroNotam(row.numero_notam)
      const fir = this.normalizeOptionalString(row.fir)?.toUpperCase() ?? ''

      if (sourceId) {
        map.set(sourceId, !!row.lido)
      }

      if (numeroNotam) {
        map.set(numeroNotam, !!row.lido)
        map.set(`${numeroNotam}::${fir}`, !!row.lido)
      }
    }

    return map
  }

  async isRead(input: {
    sourceId?: string | null
    numeroNotam: string
    fir?: string | null
  }): Promise<boolean> {
    const map = await this.buildReadStateMap()

    const numeroNotam = this.normalizeNumeroNotam(input.numeroNotam)
    const fir = this.normalizeOptionalString(input.fir)?.toUpperCase() ?? ''
    const sourceId = this.buildSourceId({
      sourceId: input.sourceId,
      numeroNotam,
      fir,
    })

    if (map.has(sourceId)) {
      return !!map.get(sourceId)
    }

    if (map.has(`${numeroNotam}::${fir}`)) {
      return !!map.get(`${numeroNotam}::${fir}`)
    }

    if (map.has(numeroNotam)) {
      return !!map.get(numeroNotam)
    }

    return false
  }
}