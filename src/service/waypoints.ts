import { Injectable, Logger } from '@nestjs/common'
import { WaypointModel } from '../models/notams/waypoint.model'
import * as XLSX from 'xlsx'

@Injectable()
export class WaypointsService {
  private readonly logger = new Logger(WaypointsService.name)

  private readonly waypointsUrl =
    process.env.WAYPOINTS_URL ||
    'https://teste2005192.kloudbean-s3.com/1776344946_SETOR_WAYPOINTS.xlsx'

  async findAll(): Promise<WaypointModel[]> {
    const buffer = await this.fetchBuffer(this.waypointsUrl)
    const waypoints = this.parseXlsx(buffer)

    this.logger.log(`Waypoints carregados: ${waypoints.length}`)

    return waypoints
  }

  async findAsGeoJson() {
    const waypoints = await this.findAll()

    return {
      type: 'FeatureCollection',
      features: waypoints.map((w) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [w.longitude, w.latitude],
        },
        properties: {
          ident: w.ident,
        },
      })),
    }
  }

  private async fetchBuffer(url: string): Promise<Buffer> {
    const res = await fetch(url)

    if (!res.ok) {
      throw new Error(`Erro ao baixar XLSX: ${res.status}`)
    }

    const arrayBuffer = await res.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }

  private parseXlsx(buffer: Buffer): WaypointModel[] {
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]

    const rows: any[] = XLSX.utils.sheet_to_json(sheet, {
      defval: '',
      raw: false,
    })

    const waypoints: WaypointModel[] = []

    for (const row of rows) {
      const ident =
        row.ident ||
        row.IDENT ||
        row.NOME ||
        row.NAME ||
        row.WAYPOINT ||
        row.FIX ||
        row.CODIGO

      const lat =
        row.latitude ||
        row.LATITUDE ||
        row.lat ||
        row.y ||
        row.COORD_LAT

      const lon =
        row.longitude ||
        row.LONGITUDE ||
        row.lon ||
        row.lng ||
        row.x ||
        row.COORD_LON

      if (!ident || !lat || !lon) continue

      const latitude = this.parseNumber(lat)
      const longitude = this.parseNumber(lon)

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue

      waypoints.push({
        ident: String(ident).trim().toUpperCase(),
        latitude,
        longitude,
      })
    }

    return waypoints
  }

  private parseNumber(value: any): number {
    if (typeof value === 'number') return value

    const text = String(value).replace(',', '.').trim()
    const num = Number(text)

    return Number.isFinite(num) ? num : NaN
  }
}