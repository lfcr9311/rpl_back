import { Injectable, Logger } from '@nestjs/common'
import { XMLParser } from 'fast-xml-parser'
import { WaypointModel } from '../models/notams/waypoint.model'

@Injectable()
export class WaypointsService {
  private readonly logger = new Logger(WaypointsService.name)

  private readonly waypointsUrl =
    process.env.WAYPOINTS_URL ||
    'https://geoaisweb.decea.mil.br/geoserver/ICA/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=ICA%3Awaypoint'

  private readonly parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    trimValues: true,
    parseTagValue: false,
    removeNSPrefix: true,
  })

  async findAll(): Promise<WaypointModel[]> {
    const xml = await this.fetchText(this.waypointsUrl)
    const waypoints = this.parseXml(xml)

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

  private async fetchText(url: string): Promise<string> {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/xml,text/xml,*/*',
        'User-Agent': 'Mozilla/5.0 Waypoints Client',
      },
    })

    if (!res.ok) {
      throw new Error(`Erro ao buscar waypoints WFS: ${res.status}`)
    }

    return res.text()
  }

  private parseXml(xml: string): WaypointModel[] {
    const parsed = this.parser.parse(xml)
    const result = new Map<string, WaypointModel>()

    this.walk(parsed, (node) => {
      const ident = this.pick(node, ['ident', 'IDENT', 'name', 'NAME'])
      const lat = this.pick(node, ['latitude', 'LATITUDE', 'lat', 'LAT'])
      const lon = this.pick(node, ['longitude', 'LONGITUDE', 'lon', 'LON'])

      if (!ident || lat === undefined || lon === undefined) return

      const waypoint: WaypointModel = {
        ident: String(ident).trim().toUpperCase(),
        latitude: this.parseNumber(lat),
        longitude: this.parseNumber(lon),
      }

      if (!waypoint.ident) return
      if (!Number.isFinite(waypoint.latitude)) return
      if (!Number.isFinite(waypoint.longitude)) return
      if (Math.abs(waypoint.latitude) > 90) return
      if (Math.abs(waypoint.longitude) > 180) return

      result.set(waypoint.ident, waypoint)
    })

    return Array.from(result.values()).sort((a, b) =>
      a.ident.localeCompare(b.ident),
    )
  }

  private walk(value: unknown, callback: (node: Record<string, unknown>) => void) {
    if (!value || typeof value !== 'object') return

    if (Array.isArray(value)) {
      for (const item of value) {
        this.walk(item, callback)
      }
      return
    }

    const node = value as Record<string, unknown>
    callback(node)

    for (const child of Object.values(node)) {
      this.walk(child, callback)
    }
  }

  private pick(node: Record<string, unknown>, keys: string[]): unknown {
    for (const key of keys) {
      if (node[key] !== undefined && node[key] !== null && String(node[key]).trim()) {
        return node[key]
      }
    }

    return undefined
  }

  private parseNumber(value: unknown): number {
    if (typeof value === 'number') return value

    const text = String(value ?? '').replace(',', '.').trim()
    const num = Number(text)

    return Number.isFinite(num) ? num : NaN
  }
}