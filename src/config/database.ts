import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common'
import { Pool, PoolClient, QueryResult } from 'pg'

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool!: Pool
  private readonly logger = new Logger(DatabaseService.name)

  async onModuleInit() {
    const connectionString = process.env.DATABASE_URL

    if (!connectionString || !connectionString.trim()) {
      throw new Error('DATABASE_URL não definida')
    }

    this.pool = new Pool({
      connectionString,
      ssl: connectionString.includes('localhost')
        ? false
        : { rejectUnauthorized: false },
    })

    this.logger.log('Conectando ao banco...')

    try {
      const client = await this.pool.connect()
      this.logger.log('Conexão com banco OK')

      // Teste simples
      await client.query('SELECT 1')
      this.logger.log('Query básica OK')

      // 🔥 CHECK DE MIGRAÇÃO (ajusta o nome da tabela)
      const result = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
      `)

      const tables = result.rows.map((r) => r.table_name)

      this.logger.log(`Tabelas encontradas: ${tables.join(', ') || 'nenhuma'}`)

      // exemplo: verifica tabela específica criada pela migração
      const expectedTable = 'notam' // ajuste aqui
      if (tables.includes(expectedTable)) {
        this.logger.log(`Migração OK: tabela "${expectedTable}" existe`)
      } else {
        this.logger.error(`Migração NÃO aplicada: tabela "${expectedTable}" NÃO existe`)
      }

      client.release()
    } catch (err) {
      this.logger.error('Erro ao conectar ou validar migração', err)
      throw err
    }
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.end()
      this.logger.log('Pool encerrado')
    }
  }

  async query<T = any>(text: string, params: unknown[] = []): Promise<QueryResult<T>> {
    this.logger.debug(`Query: ${text} | Params: ${JSON.stringify(params)}`)
    return this.pool.query<T>(text, params)
  }

  async getClient(): Promise<PoolClient> {
    this.logger.debug('Pegando client do pool')
    return this.pool.connect()
  }
}