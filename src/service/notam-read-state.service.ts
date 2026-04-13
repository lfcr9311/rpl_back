import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/config/prisma.service'

@Injectable()
export class NotamReadStateService {
  constructor(private readonly prisma: PrismaService) {}

  async setReadState(params: {
    sourceId: string
    numeroNotam: string
    fir?: string
    lido: boolean
  }) {
    const sourceId = String(params.sourceId ?? '').trim()
    const numeroNotam = String(params.numeroNotam ?? '').trim().toUpperCase()
    const fir = String(params.fir ?? '').trim().toUpperCase() || null

    return this.prisma.notamReadState.upsert({
      where: {
        sourceId_numeroNotam: {
          sourceId,
          numeroNotam,
        },
      },
      create: {
        sourceId,
        numeroNotam,
        fir,
        lido: params.lido,
      },
      update: {
        fir,
        lido: params.lido,
      },
    })
  }

  async markAsRead(params: {
    sourceId: string
    numeroNotam: string
    fir?: string
  }) {
    return this.setReadState({
      ...params,
      lido: true,
    })
  }

  async markAsUnread(params: {
    sourceId: string
    numeroNotam: string
    fir?: string
  }) {
    return this.setReadState({
      ...params,
      lido: false,
    })
  }

  async getReadStates(fir?: string) {
    const normalizedFir = String(fir ?? '').trim().toUpperCase()

    return this.prisma.notamReadState.findMany({
      where: normalizedFir ? { fir: normalizedFir } : undefined,
      select: {
        sourceId: true,
        numeroNotam: true,
        fir: true,
        lido: true,
        updatedAt: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    })
  }

  async getReadMap() {
    const rows = await this.prisma.notamReadState.findMany({
      where: {
        lido: true,
      },
      select: {
        sourceId: true,
        numeroNotam: true,
      },
    })

    const map = new Set<string>()

    for (const row of rows) {
      map.add(`${row.sourceId}::${row.numeroNotam}`)
    }

    return map
  }
}