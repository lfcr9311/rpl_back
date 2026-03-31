import { Injectable } from '@nestjs/common'
import type { AiswebItemModel, LatLon } from '../models/notams/aisweb-response.model'

export type GeometryParserType =
  | 'geojson'
  | 'wkt'
  | 'geo-dms'
  | 'textE-dms'
  | 'none'
  | 'ignored-qcode'

@Injectable()
export class NotamGeometryService {
  private readonly ignoredQCodes = new Set(['QAFTT'])

  private isFiniteCoord(coord: LatLon): boolean {
    return (
      Array.isArray(coord) &&
      coord.length === 2 &&
      Number.isFinite(coord[0]) &&
      Number.isFinite(coord[1]) &&
      Math.abs(coord[0]) <= 90 &&
      Math.abs(coord[1]) <= 180
    )
  }

  private pushUniqueCoord(coords: LatLon[], coord: LatLon) {
    if (!this.isFiniteCoord(coord)) return

    const last = coords[coords.length - 1]
    if (last && last[0] === coord[0] && last[1] === coord[1]) {
      return
    }

    coords.push(coord)
  }

  private closeRingIfNeeded(coords: LatLon[]): LatLon[] {
    if (coords.length < 3) return coords

    const first = coords[0]
    const last = coords[coords.length - 1]

    if (first[0] !== last[0] || first[1] !== last[1]) {
      return [...coords, first]
    }

    return coords
  }

  private normalizeCoords(coords: LatLon[]): LatLon[] {
    const normalized: LatLon[] = []

    for (const coord of coords) {
      this.pushUniqueCoord(normalized, coord)
    }

    return this.closeRingIfNeeded(normalized)
  }

  private toLatLonFromLonLat(point: unknown): LatLon | null {
    if (!Array.isArray(point) || point.length < 2) return null

    const lon = Number(point[0])
    const lat = Number(point[1])
    const coord: LatLon = [lat, lon]

    return this.isFiniteCoord(coord) ? coord : null
  }

  private parseGeoJsonLike(raw: string): LatLon[] {
    try {
      const parsed = JSON.parse(raw)

      if (parsed?.type === 'Polygon' && Array.isArray(parsed.coordinates?.[0])) {
        return this.normalizeCoords(
          parsed.coordinates[0]
            .map((point: unknown) => this.toLatLonFromLonLat(point))
            .filter(Boolean) as LatLon[],
        )
      }

      if (parsed?.type === 'MultiPolygon' && Array.isArray(parsed.coordinates?.[0]?.[0])) {
        return this.normalizeCoords(
          parsed.coordinates[0][0]
            .map((point: unknown) => this.toLatLonFromLonLat(point))
            .filter(Boolean) as LatLon[],
        )
      }

      if (Array.isArray(parsed?.coordinates?.[0])) {
        return this.normalizeCoords(
          parsed.coordinates[0]
            .map((point: unknown) => this.toLatLonFromLonLat(point))
            .filter(Boolean) as LatLon[],
        )
      }

      return []
    } catch {
      return []
    }
  }

  private parseWktRing(text: string): LatLon[] {
    const coords: LatLon[] = []

    for (const part of text.split(',')) {
      const pieces = part.trim().split(/\s+/)
      if (pieces.length < 2) continue

      const lon = Number(pieces[0])
      const lat = Number(pieces[1])

      this.pushUniqueCoord(coords, [lat, lon])
    }

    return this.closeRingIfNeeded(coords)
  }

  private parseWkt(raw: string): LatLon[] {
    const text = raw.trim()

    const polygon = text.match(/^POLYGON\s*\(\((.+)\)\)$/i)
    if (polygon) {
      return this.parseWktRing(polygon[1])
    }

    const multiPolygon = text.match(/^MULTIPOLYGON\s*\(\(\((.+?)\)\)\)/i)
    if (multiPolygon) {
      return this.parseWktRing(multiPolygon[1])
    }

    return []
  }

  private dmsToDecimal(deg: number, min: number, sec: number, hemi: string): number {
    let value = deg + min / 60 + sec / 3600

    if (hemi === 'S' || hemi === 'W') {
      value *= -1
    }

    return value
  }

  private parseCompactDmsToken(token: string): LatLon | null {
    const cleaned = token.trim().toUpperCase().replace(/\//g, '')

    const match = cleaned.match(
      /^(\d{2})(\d{2})(\d{2}(?:\.\d+)?)([NS])(\d{3})(\d{2})(\d{2}(?:\.\d+)?)([EW])$/,
    )

    if (!match) return null

    const lat = this.dmsToDecimal(
      Number(match[1]),
      Number(match[2]),
      Number(match[3]),
      match[4],
    )

    const lon = this.dmsToDecimal(
      Number(match[5]),
      Number(match[6]),
      Number(match[7]),
      match[8],
    )

    const coord: LatLon = [lat, lon]
    return this.isFiniteCoord(coord) ? coord : null
  }

  private parseDmsSequence(raw: string): LatLon[] {
    const normalized = raw
      .replace(/,/g, ' ')
      .replace(/;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    const matches =
      normalized.match(/\d{6}(?:\.\d+)?[NS]\/?\d{7}(?:\.\d+)?[EW]/gi) ?? []

    const coords: LatLon[] = []

    for (const token of matches) {
      const coord = this.parseCompactDmsToken(token)
      if (coord) {
        this.pushUniqueCoord(coords, coord)
      }
    }

    return this.closeRingIfNeeded(coords)
  }

  isIgnoredQCode(item: AiswebItemModel): boolean {
    const q = String(item.cod ?? '').trim().toUpperCase()
    return this.ignoredQCodes.has(q)
  }

  isPolygonParser(parser: GeometryParserType): boolean {
    return (
      parser === 'geojson' ||
      parser === 'wkt' ||
      parser === 'geo-dms' ||
      parser === 'textE-dms'
    )
  }

  extractCoordsFromItem(
    item: AiswebItemModel,
  ): { coords: LatLon[]; parser: GeometryParserType } {
    if (this.isIgnoredQCode(item)) {
      return { coords: [], parser: 'ignored-qcode' }
    }

    const geo = String(item.geo ?? '').trim()
    const textE = String(item.e ?? '').trim()

    if (geo) {
      const geoJson = this.parseGeoJsonLike(geo)
      if (geoJson.length >= 4) {
        return { coords: geoJson, parser: 'geojson' }
      }

      const wkt = this.parseWkt(geo)
      if (wkt.length >= 4) {
        return { coords: wkt, parser: 'wkt' }
      }

      const dmsFromGeo = this.parseDmsSequence(geo)
      if (dmsFromGeo.length >= 4) {
        return { coords: dmsFromGeo, parser: 'geo-dms' }
      }
    }

    if (textE) {
      const dmsFromText = this.parseDmsSequence(textE)
      if (dmsFromText.length >= 4) {
        return { coords: dmsFromText, parser: 'textE-dms' }
      }
    }

    return { coords: [], parser: 'none' }
  }

  inferAreaType(item: AiswebItemModel): string {
    const q = String(item.cod ?? '').toUpperCase()
    const e = String(item.e ?? '').toUpperCase()

    if (q.includes('QRR') || e.includes('RESTRICTED') || e.includes('AREA RESTRITA')) {
      return 'RESTRICTED'
    }

    if (q.includes('QRP') || e.includes('PROHIBITED') || e.includes('AREA PROIBIDA')) {
      return 'PROHIBITED'
    }

    if (q.includes('QRD') || e.includes('DANGER') || e.includes('PERIGOSA')) {
      return 'DANGER'
    }

    return 'OTHER'
  }
}