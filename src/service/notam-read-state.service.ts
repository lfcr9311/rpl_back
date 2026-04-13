import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/config/prisma.service'

type SetReadStateInput = {
  sourceId?: string | null
  numeroNotam: string
  fir?: string | null
  lido: boolean
}

@Injectable()
export class NotamReadStateService {
  constructor(private readonly prisma: PrismaService) {}

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

  async setReadState(input: SetReadStateInput) {
    const sourceId = this.normalizeOptionalString(input.sourceId)
    const numeroNotam = this.normalizeNumeroNotam(input.numeroNotam)
    const fir = this.normalizeOptionalString(input.fir)?.toUpperCase()
    const uniqueSourceId = sourceId ?? `ALT::${numeroNotam}::${fir ?? ''}`

    return this.prisma.notamReadState.upsert({
      where: {
        sourceId_numeroNotam: {
          sourceId: uniqueSourceId,
          numeroNotam,
        },
      },
      update: {
        fir,
        lido: input.lido,
      },
      create: {
        sourceId: uniqueSourceId,
        numeroNotam,
        fir,
        lido: input.lido,
      },
    })
  }

  async listReadStates(fir?: string) {
    const normalizedFir = this.normalizeOptionalString(fir)?.toUpperCase()

    return this.prisma.notamReadState.findMany({
      where: normalizedFir
        ? {
            fir: normalizedFir,
          }
        : undefined,
      orderBy: {
        updatedAt: 'desc',
      },
    })
  }

  async getReadStates(fir?: string) {
    return this.listReadStates(fir)
  }

  async buildReadStateMap(fir?: string) {
    const normalizedFir = this.normalizeOptionalString(fir)?.toUpperCase()

    const rows = await this.prisma.notamReadState.findMany({
      where: normalizedFir
        ? {
            fir: normalizedFir,
          }
        : undefined,
    })

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