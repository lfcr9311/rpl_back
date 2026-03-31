import { Injectable, OnModuleInit } from '@nestjs/common'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { EnvService } from 'src/config/env.service'
import { PrismaClient } from 'src/generated/prisma/client'
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor(private readonly envService: EnvService) {
    const adapter = new PrismaBetterSqlite3({
      url: envService.databaseUrl,
    })

    super({ adapter })
  }

  async onModuleInit() {
    await this.$connect()
  }
}