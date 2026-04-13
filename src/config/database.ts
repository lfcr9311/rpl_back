import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { Pool, PoolClient, QueryResult } from 'pg'

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool!: Pool

  onModuleInit() {
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
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.end()
    }
  }

  async query<T = any>(text: string, params: unknown[] = []): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, params)
  }

  async getClient(): Promise<PoolClient> {
    return this.pool.connect()
  }
}