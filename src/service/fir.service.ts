import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common'
import { FirModel, LatLon } from '../models/notams/fir.model'

@Injectable()
export class FirService {
  private readonly logger = new Logger(FirService.name)

  private readonly firUrl =
    'https://teste2005192.kloudbean-s3.com/1776344946_SETOR_FIR.csv'

  async findAll(): Promise<FirModel[]> {
    const csv = await this.fetchText(this.firUrl)
    const firs = this.parseFirCsv(csv)

    this.logger.log(`FIRs carregadas: ${firs.length}`)

    return firs
  }

  private async fetchText(url: string): Promise<string> {
    try {
      const response = await fetch(url)

      if (!response.ok) {
        throw new InternalServerErrorException(
          `Falha ao baixar CSV de FIR. HTTP ${response.status}`,
        )
      }

      return await response.text()
    } catch (error) {
      this.logger.error('Erro ao baixar CSV de FIR', error as Error)
      throw new InternalServerErrorException('Erro ao baixar CSV de FIR')
    }
  }

  private parseFirCsv(csv: string): FirModel[] {
    const lines = String(csv ?? '')
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)

    if (lines.length <= 1) {
      return []
    }

    const header = this.splitCsvRow(lines[0])

    const idIndex = this.findColumnIndex(header, ['fid', 'id'])
    const identIndex = this.findColumnIndex(header, ['ident'])
    const nameIndex = this.findColumnIndex(header, ['nam', 'name', 'nome'])
    const icaoIndex = this.findColumnIndex(header, ['icaocode', 'icao'])
    const relatedFirIndex = this.findColumnIndex(header, ['relatedfir'])
    const typeIndex = this.findColumnIndex(header, ['typ', 'type', 'tipo'])
    const geomIndex = this.findColumnIndex(header, ['geom', 'geometry', 'wkt'])

    const result: FirModel[] = []

    for (let i = 1; i < lines.length; i++) {
      const cols = this.splitCsvRow(lines[i])

      const geom = geomIndex >= 0 ? cols[geomIndex] : ''
      const coords = this.extractPolygonWktPoints(geom)

      if (coords.length < 3) {
        continue
      }

      const id =
        idIndex >= 0
          ? String(cols[idIndex] ?? '').trim()
          : `FIR_${i}`

      const ident =
        identIndex >= 0
          ? String(cols[identIndex] ?? '').trim()
          : id

      const nomeRaw =
        nameIndex >= 0
          ? String(cols[nameIndex] ?? '').trim()
          : ''

      const icaocode =
        icaoIndex >= 0
          ? String(cols[icaoIndex] ?? '').trim().toUpperCase()
          : ''

      const relatedfir =
        relatedFirIndex >= 0
          ? String(cols[relatedFirIndex] ?? '').trim().toUpperCase()
          : ''

      const tipo =
        typeIndex >= 0
          ? String(cols[typeIndex] ?? '').trim()
          : ''

      const nome = nomeRaw || ident || icaocode || id

      result.push({
        id,
        ident,
        nome,
        icaocode,
        relatedfir,
        tipo,
        coords_latlon: coords,
      })
    }

    return result
  }

  private splitCsvRow(row: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < row.length; i++) {
      const char = row[i]

      if (char === '"') {
        if (inQuotes && row[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
        continue
      }

      if (char === ',' && !inQuotes) {
        result.push(current)
        current = ''
        continue
      }

      current += char
    }

    result.push(current)

    return result.map((value) => value.trim())
  }

  private findColumnIndex(header: string[], candidates: string[]): number {
    const normalizedHeader = header.map((item) => item.trim().toLowerCase())

    for (const candidate of candidates) {
      const index = normalizedHeader.indexOf(candidate.toLowerCase())
      if (index >= 0) {
        return index
      }
    }

    return -1
  }

  private extractPolygonWktPoints(wkt: string): LatLon[] {
    const cleaned = String(wkt ?? '').trim()

    if (!cleaned) {
      return []
    }

    const match = cleaned.match(/^POLYGON\s*\(\((.*)\)\)$/i)
    if (!match) {
      return []
    }

    const pointsRaw = match[1]
    const pairs = pointsRaw.split(',')

    const coords: LatLon[] = []

    for (const pair of pairs) {
      const parts = pair.trim().split(/\s+/)

      if (parts.length < 2) {
        continue
      }

      const lon = Number(parts[0])
      const lat = Number(parts[1])

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        continue
      }

      if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        continue
      }

      coords.push([lat, lon])
    }

    return this.closeRing(coords)
  }

  private closeRing(coords: LatLon[]): LatLon[] {
    if (coords.length < 3) {
      return coords
    }

    const normalized = [...coords]
    const first = normalized[0]
    const last = normalized[normalized.length - 1]

    if (first[0] !== last[0] || first[1] !== last[1]) {
      normalized.push(first)
    }

    return normalized
  }
}