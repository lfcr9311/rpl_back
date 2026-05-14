import { Injectable } from '@nestjs/common'
import { XMLParser } from 'fast-xml-parser'
import { readFile } from 'node:fs/promises'
import { EnvService } from '../config/env.service'
import { DatabaseService } from '../config/database'
import {
  AeroviaLinhaModel,
  AeroviasResponseModel,
  AeroviaUruguayCsvRowModel,
  AeroviaUruguayModel,
  AiswebItemModel,
  AiswebResponseModel,
  AeroportoModel,
  AreaNotamApiModel,
  GeoJsonFeatureModel,
  GeoJsonGeometryModel,
  GeoJsonResponseModel,
  LatLon,
  RotaRplModel,
  WaypointModel,
} from '../models/notams/aisweb-response.model'
import { NotamModel } from '../models/notams/notam'
import { NotamReadStateService } from './notam-read-state.service'

type GeometryParserType =
  | 'geojson'
  | 'wkt'
  | 'geo-dms'
  | 'textE-dms'
  | 'circle'
  | 'none'
  | 'ignored-qcode'
  | 'border-closure-unsupported'

type AreaKind =
  | 'AIRSPACE_RESERVATION'
  | 'DANGER'
  | 'MILITARY'
  | 'OVERFLYING'
  | 'OTHER'
  | 'PROHIBITED'
  | 'RESTRICTED'
  | 'TEMP_RESTRICTED'
  | 'WARNING_AREA'

type ExtractedGeometry =
  | {
      parser: 'circle'
      coords: []
      center: LatLon
      radius_m: number
    }
  | {
      parser: Exclude<GeometryParserType, 'circle'>
      coords: LatLon[]
      center: null
      radius_m: null
    }

type RplFlightDbRow = {
  id: string
  flightNumber: string
  equipment: string | null
  startDate: Date | string | null
  endDate: Date | string | null
  isMonday: boolean
  isTuesday: boolean
  isWednesday: boolean
  isThursday: boolean
  isFriday: boolean
  isSaturday: boolean
  isSunday: boolean
  departure: string
  arrival: string
  eobt: string | null
  speed: string | null
  flightLevel: string | null
  route: string | null
  eet: string | null
  remarks: string | null
  originalLine: string | null
}

@Injectable()
export class NotamsService {
  constructor(
    private readonly envService: EnvService,
    private readonly notamReadStateService: NotamReadStateService,
    private readonly db: DatabaseService,
  ) {}

  private readonly parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    trimValues: true,
    parseTagValue: false,
  })

  private readonly targetFirs = ['SBCW', 'SBBS', 'SBRE', 'SBAZ', 'SBAO']
  private readonly ignoredQCodes = new Set(['QAFTT'])

  private readonly restrictedSubjects = new Set([
    'RA',
    'RD',
    'RM',
    'RO',
    'RP',
    'RR',
    'RT',
  ])

  private readonly EARTH_RADIUS_M = 6371000
  private readonly NM_TO_M = 1852

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private normalizeReadKey(
    sourceId?: string | null,
    numeroNotam?: string | null,
  ): string {
    return `${String(sourceId ?? '').trim()}::${String(numeroNotam ?? '')
      .trim()
      .toUpperCase()}`
  }

  private normalizeIdent(value?: string | null): string {
    return String(value ?? '').trim().toUpperCase()
  }

  private logSourceFailure(source: string, error: unknown) {
    console.error(`[FAILSAFE] fonte indisponível: ${source}`, error)
  }

  private async withFallback<T>(
    source: string,
    fallback: T,
    operation: () => Promise<T>,
  ): Promise<T> {
    try {
      return await operation()
    } catch (error) {
      this.logSourceFailure(source, error)
      return fallback
    }
  }

  private parseNotamDate(raw?: string | null): Date | null {
    if (!raw) return null

    const value = String(raw).trim().toUpperCase()

    if (!value || value === 'PERM' || value === 'UFN') {
      return null
    }

    const compact = value.replace(/\s+/g, '')
    const digits = compact.replace(/EST$/, '')

    if (/^\d{10}$/.test(digits)) {
      const year = 2000 + Number(digits.slice(0, 2))
      const month = Number(digits.slice(2, 4)) - 1
      const day = Number(digits.slice(4, 6))
      const hour = Number(digits.slice(6, 8))
      const minute = Number(digits.slice(8, 10))

      const parsed = new Date(Date.UTC(year, month, day, hour, minute))
      if (Number.isNaN(parsed.getTime())) {
        return null
      }

      return parsed
    }

    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) {
      return null
    }

    return parsed
  }

  private isPermanentNotam(item: AiswebItemModel): boolean {
    const validTo = String(item.c ?? '').trim().toUpperCase()
    return validTo === 'PERM'
  }

  private isNotamWithinCurrentWindow(
    item: AiswebItemModel,
    now = new Date(),
  ): boolean {
    const status = String(item.status ?? '').trim().toUpperCase()
    const validFrom = this.parseNotamDate(item.b)
    const validTo = this.parseNotamDate(item.c)

    if (status && status !== 'ACTIVE') {
      return false
    }

    if (validFrom && now < validFrom) {
      return false
    }

    if (validTo && now > validTo) {
      return false
    }

    return true
  }

  private normalizeItems(xml: string): AiswebItemModel[] {
    const parsed = this.parser.parse(xml) as AiswebResponseModel
    const rawItems = parsed?.aisweb?.notam?.item

    if (!rawItems) {
      return []
    }

    return Array.isArray(rawItems) ? rawItems : [rawItems]
  }

  private toModel(item: AiswebItemModel): NotamModel {
    return new NotamModel({
      id: item.id,
      number: item.n ?? item.number ?? '',
      qcode: item.cod ?? null,
      status: item.status ?? null,
      category: item.cat ?? null,
      dist: item.dist ?? null,
      type: item.tp ?? null,
      issuedAt: this.parseNotamDate(item.dt),
      location: item.loc ?? null,
      fir: item.fir ?? null,
      validFromRaw: item.b ?? null,
      validToRaw: item.c ?? null,
      validFrom: this.parseNotamDate(item.b),
      validTo: this.parseNotamDate(item.c),
      dailyWindowsRaw: item.d ?? null,
      textE: item.e ?? null,
      lowerLimit: item.f ?? item.lower ?? null,
      upperLimit: item.g ?? item.upper ?? null,
      geo: item.geo ?? null,
      geoUrl: item.geo_url ?? null,
      traffic: item.traffic ?? null,
      purpose: item.purpose ?? null,
      scope: item.scope ?? null,
      rawPayload: JSON.stringify(item),
    })
  }

  private normalizeFir(value?: string | null): string {
    return String(value ?? '').trim().toUpperCase()
  }

  private isTargetFir(value?: string | null): boolean {
    return this.targetFirs.includes(this.normalizeFir(value))
  }

  private extractTargetFirsFromLoc(loc?: string | null): string[] {
    const value = String(loc ?? '').trim().toUpperCase()
    if (!value) return []

    const matches = value.match(/\bSB[A-Z]{2}\b/g) ?? []
    const unique = new Set<string>()

    for (const token of matches) {
      if (this.isTargetFir(token)) {
        unique.add(token)
      }
    }

    return Array.from(unique)
  }

  private resolveItemTargetFirs(item: AiswebItemModel): string[] {
    const resolved = new Set<string>()

    const fir = this.normalizeFir(item.fir)
    if (this.isTargetFir(fir)) {
      resolved.add(fir)
    }

    for (const locFir of this.extractTargetFirsFromLoc(item.loc)) {
      resolved.add(locFir)
    }

    return Array.from(resolved).sort()
  }

  private buildAiswebUrl(icaocode?: string, minutes?: number): string {
    const params = new URLSearchParams({
      apiKey: this.envService.aiswebApiKey,
      apiPass: this.envService.aiswebApiPass,
      area: this.envService.aiswebArea,
      dist: this.envService.aiswebDist,
      all: this.envService.aiswebAll,
      minutes: String(minutes ?? this.envService.aiswebMinutes),
    })

    if (icaocode) {
      params.set('icaocode', icaocode)
    }

    return `${this.envService.aiswebApiUrl}?${params.toString()}`
  }

  private maskAiswebUrl(url: string): string {
    return url.replace(/apiPass=([^&]+)/i, 'apiPass=***')
  }

  private normalizeQCode(qcode?: string | null): string {
    return String(qcode ?? '').trim().toUpperCase()
  }

  private getQCodeSubject(qcode?: string | null): string {
    const code = this.normalizeQCode(qcode)
    if (code.length < 3) return ''
    if (code.startsWith('Q')) return code.slice(1, 3)
    return code.slice(0, 2)
  }

  private isIgnoredQCode(qcode?: string | null): boolean {
    return this.ignoredQCodes.has(this.normalizeQCode(qcode))
  }

  private textLooksLikeArea(text?: string | null): boolean {
    const value = String(text ?? '').toUpperCase()

    if (!value) return false

    return (
      value.includes('AREA RESTRITA') ||
      value.includes('AREA RESTRITA TEMPORARIAMENTE') ||
      value.includes('AREA PROIBIDA') ||
      value.includes('AREA PERIGOSA') ||
      value.includes('AREA DE PERIGO') ||
      value.includes('AREA DE OPERACAO MILITAR') ||
      value.includes('MILITARY OPERATING AREA') ||
      value.includes('AIRSPACE RESERVATION') ||
      value.includes('AREA DEFINED BY') ||
      value.includes('AREA DELIMITADA') ||
      value.includes('AREA COMPREENDIDA') ||
      value.includes('AREA CIRCULAR') ||
      value.includes('RAIO') ||
      value.includes('WI COORD') ||
      /\bSBR\s?\d{3}\b/.test(value) ||
      /\bSBP\s?\d{3}\b/.test(value) ||
      /\bSBD\s?\d{3}\b/.test(value)
    )
  }

  private textUsesBorderClosure(text?: string | null): boolean {
    const value = String(text ?? '').toUpperCase()

    if (!value) return false

    return (
      value.includes('SEGUINDO TODA FAIXA DE FRONTEIRA TERRESTRE') ||
      value.includes('SEGUINDO A FRONTEIRA TERRESTRE') ||
      value.includes('SEGUINDO A FRONTEIRA') ||
      value.includes('FAIXA DE FRONTEIRA') ||
      value.includes('DENTRO DO TERRITORIO NACIONAL') ||
      value.includes('ALONG THE BORDER') ||
      value.includes('ALONG THE INTERNATIONAL BORDER')
    )
  }

  private isAreaQCode(qcode?: string | null, textE?: string | null): boolean {
    const subject = this.getQCodeSubject(qcode)

    if (this.restrictedSubjects.has(subject)) {
      return true
    }

    if (this.textLooksLikeArea(textE)) {
      return true
    }

    return false
  }

  private shouldPlotNotamArea(item: AiswebItemModel): boolean {
    const qcode = this.normalizeQCode(item.cod)

    if (this.isPermanentNotam(item)) return false
    if (this.isIgnoredQCode(qcode)) return false
    if (!this.isAreaQCode(qcode, item.e)) return false

    return true
  }

  private inferAreaKindFromQCode(
    qcode?: string | null,
    textE?: string | null,
  ): AreaKind {
    const subject = this.getQCodeSubject(qcode)

    switch (subject) {
      case 'RA':
        return 'AIRSPACE_RESERVATION'
      case 'RD':
        return 'DANGER'
      case 'RM':
        return 'MILITARY'
      case 'RO':
        return 'OVERFLYING'
      case 'RP':
        return 'PROHIBITED'
      case 'RR':
        return 'RESTRICTED'
      case 'RT':
        return 'TEMP_RESTRICTED'
      default:
        if (this.textLooksLikeArea(textE)) {
          return 'WARNING_AREA'
        }
        return 'OTHER'
    }
  }

  private mapAreaKindToAreaType(kind: AreaKind): string {
    switch (kind) {
      case 'PROHIBITED':
        return 'PROHIBITED'
      case 'RESTRICTED':
      case 'TEMP_RESTRICTED':
      case 'AIRSPACE_RESERVATION':
      case 'OVERFLYING':
        return 'RESTRICTED'
      case 'DANGER':
      case 'MILITARY':
      case 'WARNING_AREA':
        return 'DANGER'
      default:
        return 'OTHER'
    }
  }

  private async fetchWithTimeout(
    url: string,
    timeoutMs = 20000,
  ): Promise<Response> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    try {
      return await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          Accept:
            'application/xml,text/xml,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
          'User-Agent': 'Mozilla/5.0 NOTAM Client',
          Connection: 'close',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      })
    } finally {
      clearTimeout(timeout)
    }
  }

  private async fetchRemoteNotamsXml(
    icaocode?: string,
    minutes?: number,
    maxAttempts = 4,
    timeoutMs = 20000,
  ): Promise<string> {
    const url = this.buildAiswebUrl(icaocode, minutes)
    const firLabel = icaocode || 'GERAL'
    let lastError: unknown = null

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`[NOTAM] Consultando FIR ${firLabel}`)
        console.log('[NOTAM] URL:', this.maskAiswebUrl(url))
        console.log(`[NOTAM] Tentativa ${attempt}/${maxAttempts}`)

        const response = await this.fetchWithTimeout(url, timeoutMs)

        if (!response.ok) {
          throw new Error(`AISWEB error ${response.status}`)
        }

        const xml = await response.text()

        if (!xml || !xml.trim()) {
          throw new Error('Resposta vazia da AISWEB')
        }

        return xml
      } catch (error) {
        lastError = error
        console.log(
          `[NOTAM] Erro ao consultar ${firLabel} na tentativa ${attempt}:`,
          error,
        )

        if (attempt < maxAttempts) {
          const waitMs = attempt * 2000
          console.log(`[NOTAM] Nova tentativa para ${firLabel} em ${waitMs}ms`)
          await this.sleep(waitMs)
        }
      }
    }

    throw lastError
  }

  async fetchRemoteNotams(
    icaocode?: string,
    minutes?: number,
  ): Promise<AiswebItemModel[]> {
    return this.withFallback(
      `AISWEB ${icaocode || 'GERAL'}`,
      [],
      async () => {
        const xml = await this.fetchRemoteNotamsXml(icaocode, minutes)
        const items = this.normalizeItems(xml)
        console.log('[NOTAM] Total bruto recebido da API:', items.length)
        return items
      },
    )
  }

  async fetchRemoteNotamsFromAllTargetFirs(
    minutes?: number,
  ): Promise<AiswebItemModel[]> {
    const allItems: AiswebItemModel[] = []

    for (const fir of this.targetFirs) {
      const items = await this.fetchRemoteNotams(fir, minutes)
      console.log(`[NOTAM] ${fir}: ${items.length} itens`)
      allItems.push(...items)
    }

    return allItems
  }

  async getRemoteNotams(params?: {
    icaocode?: string
    minutes?: number
  }): Promise<NotamModel[]> {
    const items = await this.fetchRemoteNotams(
      params?.icaocode,
      params?.minutes,
    )

    return items
      .filter((item) => this.isNotamWithinCurrentWindow(item))
      .map((item) => this.toModel(item))
  }

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

  private geoJsonCoordsToLatLon(coords: unknown[]): LatLon[] {
    const result: LatLon[] = []

    for (const point of coords) {
      if (!Array.isArray(point) || point.length < 2) continue

      const lon = Number(point[0])
      const lat = Number(point[1])

      this.pushUniqueCoord(result, [lat, lon])
    }

    return this.closeRingIfNeeded(result)
  }

  private parseGeoJsonLike(raw: string): LatLon[] {
    try {
      const parsed = JSON.parse(raw)

      if (parsed?.type === 'Polygon' && Array.isArray(parsed.coordinates?.[0])) {
        return this.geoJsonCoordsToLatLon(parsed.coordinates[0])
      }

      if (
        parsed?.type === 'MultiPolygon' &&
        Array.isArray(parsed.coordinates?.[0]?.[0])
      ) {
        return this.geoJsonCoordsToLatLon(parsed.coordinates[0][0])
      }

      if (Array.isArray(parsed?.coordinates?.[0])) {
        return this.geoJsonCoordsToLatLon(parsed.coordinates[0])
      }

      return []
    } catch {
      return []
    }
  }

  private parseWktRing(text: string): LatLon[] {
    const coords: LatLon[] = []

    for (const part of text.split(',')) {
      const pair = part.trim().split(/\s+/)
      if (pair.length < 2) continue

      const lon = Number(pair[0])
      const lat = Number(pair[1])

      this.pushUniqueCoord(coords, [lat, lon])
    }

    return this.closeRingIfNeeded(coords)
  }

  private parseWktPolygon(raw: string): LatLon[] {
    const text = raw.trim()

    const polygonMatch = text.match(/^POLYGON\s*\(\((.+)\)\)$/i)
    if (polygonMatch) {
      return this.parseWktRing(polygonMatch[1])
    }

    const multiPolygonMatch = text.match(/^MULTIPOLYGON\s*\(\(\((.+?)\)\)\)/i)
    if (multiPolygonMatch) {
      return this.parseWktRing(multiPolygonMatch[1])
    }

    return []
  }

  private dmsToDecimal(
    deg: number,
    min: number,
    sec: number,
    hemi: string,
  ): number {
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

  private parseGeoCircle(
    raw?: string | null,
  ): { center: LatLon; radius_m: number } | null {
    const value = String(raw ?? '').trim().toUpperCase()
    if (!value) return null

    const match = value.match(/^(\d{2})(\d{2})([NS])(\d{3})(\d{2})([EW])(\d{3})$/)

    if (!match) return null

    const latDeg = Number(match[1])
    const latMin = Number(match[2])
    const latHem = match[3]
    const lonDeg = Number(match[4])
    const lonMin = Number(match[5])
    const lonHem = match[6]
    const radiusNm = Number(match[7])

    const lat = (latDeg + latMin / 60) * (latHem === 'S' ? -1 : 1)
    const lon = (lonDeg + lonMin / 60) * (lonHem === 'W' ? -1 : 1)
    const radius_m = radiusNm * this.NM_TO_M

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      !Number.isFinite(radius_m)
    ) {
      return null
    }

    return {
      center: [lat, lon],
      radius_m,
    }
  }

  private toRadians(value: number): number {
    return (value * Math.PI) / 180
  }

  private toDegrees(value: number): number {
    return (value * 180) / Math.PI
  }

  private normalizeBearing(value: number): number {
    let result = value % 360
    if (result < 0) result += 360
    return result
  }

  private bearingFromCenter(center: LatLon, point: LatLon): number {
    const lat1 = this.toRadians(center[0])
    const lon1 = this.toRadians(center[1])
    const lat2 = this.toRadians(point[0])
    const lon2 = this.toRadians(point[1])

    const y = Math.sin(lon2 - lon1) * Math.cos(lat2)
    const x =
      Math.cos(lat1) * Math.sin(lat2) -
      Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1)

    return this.normalizeBearing(this.toDegrees(Math.atan2(y, x)))
  }

  private destinationPoint(
    center: LatLon,
    bearingDeg: number,
    distanceMeters: number,
  ): LatLon {
    const angularDistance = distanceMeters / this.EARTH_RADIUS_M
    const bearing = this.toRadians(bearingDeg)

    const lat1 = this.toRadians(center[0])
    const lon1 = this.toRadians(center[1])

    const sinLat1 = Math.sin(lat1)
    const cosLat1 = Math.cos(lat1)
    const sinAd = Math.sin(angularDistance)
    const cosAd = Math.cos(angularDistance)

    const lat2 = Math.asin(sinLat1 * cosAd + cosLat1 * sinAd * Math.cos(bearing))

    const lon2 =
      lon1 +
      Math.atan2(
        Math.sin(bearing) * sinAd * cosLat1,
        cosAd - sinLat1 * Math.sin(lat2),
      )

    return [this.toDegrees(lat2), this.toDegrees(lon2)]
  }

  private interpolateArcPoints(
    center: LatLon,
    radiusMeters: number,
    startPoint: LatLon,
    endPoint: LatLon,
    clockwise: boolean,
    steps = 48,
  ): LatLon[] {
    const startBearing = this.bearingFromCenter(center, startPoint)
    const endBearing = this.bearingFromCenter(center, endPoint)

    let sweep: number

    if (clockwise) {
      sweep = endBearing - startBearing
      if (sweep < 0) sweep += 360
    } else {
      sweep = startBearing - endBearing
      if (sweep < 0) sweep += 360
    }

    if (sweep === 0) {
      sweep = 360
    }

    const result: LatLon[] = []

    for (let i = 1; i < steps; i++) {
      const fraction = i / steps
      const bearing = clockwise
        ? startBearing + sweep * fraction
        : startBearing - sweep * fraction

      result.push(
        this.destinationPoint(
          center,
          this.normalizeBearing(bearing),
          radiusMeters,
        ),
      )
    }

    return result
  }

  private parseTextEWithArcs(raw: string): LatLon[] {
    const text = String(raw ?? '')
      .toUpperCase()
      .replace(/\s+/g, ' ')
      .trim()

    if (!text) return []

    const allCoordTokens =
      text.match(/\d{6}(?:\.\d+)?[NS]\/?\d{7}(?:\.\d+)?[EW]/gi) ?? []

    if (allCoordTokens.length < 3) {
      return []
    }

    const parsedCoords = allCoordTokens
      .map((token) => this.parseCompactDmsToken(token))
      .filter((coord): coord is LatLon => !!coord)

    if (parsedCoords.length < 3) {
      return []
    }

    const arcRegex =
      /AO LONGO DE UM ARCO NO SENTIDO (HORARIO|ANTI-HORARIO) DE ([\d.,]+)\s*NM DE RAIO COM CENTRO EM (\d{6}(?:\.\d+)?[NS]\/?\d{7}(?:\.\d+)?[EW])/gi

    const arcMatches = [...text.matchAll(arcRegex)]

    if (!arcMatches.length) {
      return this.closeRingIfNeeded(parsedCoords)
    }

    const finalCoords: LatLon[] = []
    let coordIndex = 0

    this.pushUniqueCoord(finalCoords, parsedCoords[coordIndex++])

    for (const arcMatch of arcMatches) {
      const direction = arcMatch[1]
      const radiusNm = Number(String(arcMatch[2]).replace(',', '.'))
      const centerToken = arcMatch[3]
      const center = this.parseCompactDmsToken(centerToken)

      if (!center || !Number.isFinite(radiusNm)) {
        continue
      }

      if (coordIndex >= parsedCoords.length) break
      const arcStart = parsedCoords[coordIndex++]
      this.pushUniqueCoord(finalCoords, arcStart)

      if (coordIndex >= parsedCoords.length) break
      const arcEnd = parsedCoords[coordIndex++]

      const arcPoints = this.interpolateArcPoints(
        center,
        radiusNm * this.NM_TO_M,
        arcStart,
        arcEnd,
        direction === 'HORARIO',
        48,
      )

      for (const point of arcPoints) {
        this.pushUniqueCoord(finalCoords, point)
      }

      this.pushUniqueCoord(finalCoords, arcEnd)
    }

    while (coordIndex < parsedCoords.length) {
      this.pushUniqueCoord(finalCoords, parsedCoords[coordIndex++])
    }

    return this.closeRingIfNeeded(finalCoords)
  }

  private isPolygonParser(parser: GeometryParserType): boolean {
    return (
      parser === 'geojson' ||
      parser === 'wkt' ||
      parser === 'geo-dms' ||
      parser === 'textE-dms'
    )
  }

  private extractGeometryFromItem(item: AiswebItemModel): ExtractedGeometry {
    if (this.isIgnoredQCode(item.cod)) {
      return {
        parser: 'ignored-qcode',
        coords: [],
        center: null,
        radius_m: null,
      }
    }

    const textE = String(item.e ?? '').trim()
    const geo = String(item.geo ?? '').trim()

    if (textE) {
      if (this.textUsesBorderClosure(textE)) {
        console.log(
          '[NOTAM] geometria depende de fechamento por fronteira terrestre',
        )
        return {
          parser: 'border-closure-unsupported',
          coords: [],
          center: null,
          radius_m: null,
        }
      }

      const textArcCoords = this.parseTextEWithArcs(textE)
      if (textArcCoords.length >= 4) {
        return {
          parser: 'textE-dms',
          coords: textArcCoords,
          center: null,
          radius_m: null,
        }
      }

      const textCoords = this.parseDmsSequence(textE)
      if (textCoords.length >= 4) {
        return {
          parser: 'textE-dms',
          coords: textCoords,
          center: null,
          radius_m: null,
        }
      }
    }

    if (geo) {
      const geoJsonCoords = this.parseGeoJsonLike(geo)
      if (geoJsonCoords.length >= 4) {
        return {
          parser: 'geojson',
          coords: geoJsonCoords,
          center: null,
          radius_m: null,
        }
      }

      const wktCoords = this.parseWktPolygon(geo)
      if (wktCoords.length >= 4) {
        return {
          parser: 'wkt',
          coords: wktCoords,
          center: null,
          radius_m: null,
        }
      }

      const dmsCoords = this.parseDmsSequence(geo)
      if (dmsCoords.length >= 4) {
        return {
          parser: 'geo-dms',
          coords: dmsCoords,
          center: null,
          radius_m: null,
        }
      }

      const circle = this.parseGeoCircle(geo)
      if (circle) {
        return {
          parser: 'circle',
          coords: [],
          center: circle.center,
          radius_m: circle.radius_m,
        }
      }
    }

    return {
      parser: 'none',
      coords: [],
      center: null,
      radius_m: null,
    }
  }

  private inferAreaType(item: AiswebItemModel): string {
    const kind = this.inferAreaKindFromQCode(item.cod, item.e)
    return this.mapAreaKindToAreaType(kind)
  }

  private dedupeAreaKey(fir: string, item: AiswebItemModel): string {
    const numero = String(item.n ?? item.number ?? '').trim().toUpperCase()
    const id = String(item.id ?? '').trim()
    return `${fir}::${numero}::${id}`
  }

  async getAreasNotamAgrupadas(
    incluirLidos = true,
  ): Promise<Record<string, AreaNotamApiModel[]>> {
    const items = await this.fetchRemoteNotamsFromAllTargetFirs()
    const readStates = await this.notamReadStateService.getReadStates()

    const readMap = new Set(
      readStates
        .filter((item) => item.lido)
        .map((item) =>
          this.normalizeReadKey(item.sourceId, item.numeroNotam),
        ),
    )

    const grouped: Record<string, AreaNotamApiModel[]> = {
      SBCW: [],
      SBBS: [],
      SBRE: [],
      SBAZ: [],
      SBAO: [],
    }

    const dedupe = new Set<string>()

    for (const item of items) {
      const numero = String(item.n ?? item.number ?? '').trim().toUpperCase()
      const qcode = this.normalizeQCode(item.cod)
      const resolvedFirs = this.resolveItemTargetFirs(item)
      const areaKind = this.inferAreaKindFromQCode(qcode, item.e)
      const sourceId = String(item.id ?? '').trim()
      const lido = readMap.has(this.normalizeReadKey(sourceId, numero))

      if (!resolvedFirs.length) continue
      if (!this.isNotamWithinCurrentWindow(item)) continue
      if (!this.shouldPlotNotamArea(item)) continue
      if (!incluirLidos && lido) continue

      const geometry = this.extractGeometryFromItem(item)

      if (geometry.parser === 'ignored-qcode') continue
      if (geometry.parser === 'border-closure-unsupported') continue
      if (geometry.parser === 'none') continue

      const isPolygon =
        geometry.parser !== 'circle' &&
        this.isPolygonParser(geometry.parser) &&
        geometry.coords.length >= 4

      const isCircle =
        geometry.parser === 'circle' &&
        !!geometry.center &&
        !!geometry.radius_m

      if (!isPolygon && !isCircle) continue

      for (const fir of resolvedFirs) {
        const key = this.dedupeAreaKey(fir, item)
        if (dedupe.has(key)) continue

        dedupe.add(key)

        grouped[fir].push({
          nome: `${numero} | ${areaKind}`,
          numero_notam: numero,
          fir_match: fir,
          area_type: this.inferAreaType(item),
          valid_from: item.b ?? '',
          valid_to: item.c ?? '',
          q_line: item.cod ?? '',
          coords_latlon: isPolygon ? geometry.coords : [],
          texto_notam: item.e ?? '',
          f: item.f ?? '',
          g: item.g ?? '',
          source_id: item.id,
          geometry_type: isPolygon ? 'POLYGON' : 'CIRCLE',
          center: isCircle ? geometry.center : null,
          radius_m: isCircle ? geometry.radius_m : null,
          lido,
        } as AreaNotamApiModel)
      }
    }

    return grouped
  }

  async findAreasFromApiByTargetFirs(
    minutes?: number,
    options?: { incluirLidos?: boolean },
  ): Promise<Record<string, AreaNotamApiModel[]>> {
    const incluirLidos = options?.incluirLidos ?? false

    if (typeof minutes === 'number' && Number.isFinite(minutes)) {
      const items = await this.fetchRemoteNotamsFromAllTargetFirs(minutes)
      const readStates = await this.notamReadStateService.getReadStates()

      const readMap = new Set(
        readStates
          .filter((item) => item.lido)
          .map((item) =>
            this.normalizeReadKey(item.sourceId, item.numeroNotam),
          ),
      )

      const grouped: Record<string, AreaNotamApiModel[]> = {
        SBCW: [],
        SBBS: [],
        SBRE: [],
        SBAZ: [],
        SBAO: [],
      }

      const dedupe = new Set<string>()

      for (const item of items) {
        const numero = String(item.n ?? item.number ?? '').trim().toUpperCase()
        const qcode = this.normalizeQCode(item.cod)
        const resolvedFirs = this.resolveItemTargetFirs(item)
        const areaKind = this.inferAreaKindFromQCode(qcode, item.e)
        const sourceId = String(item.id ?? '').trim()
        const lido = readMap.has(this.normalizeReadKey(sourceId, numero))

        if (!resolvedFirs.length) continue
        if (!this.isNotamWithinCurrentWindow(item)) continue
        if (!this.shouldPlotNotamArea(item)) continue
        if (!incluirLidos && lido) continue

        const geometry = this.extractGeometryFromItem(item)

        if (geometry.parser === 'ignored-qcode') continue
        if (geometry.parser === 'border-closure-unsupported') continue
        if (geometry.parser === 'none') continue

        const isPolygon =
          geometry.parser !== 'circle' &&
          this.isPolygonParser(geometry.parser) &&
          geometry.coords.length >= 4

        const isCircle =
          geometry.parser === 'circle' &&
          !!geometry.center &&
          !!geometry.radius_m

        if (!isPolygon && !isCircle) continue

        for (const fir of resolvedFirs) {
          const key = this.dedupeAreaKey(fir, item)
          if (dedupe.has(key)) continue

          dedupe.add(key)

          grouped[fir].push({
            nome: `${numero} | ${areaKind}`,
            numero_notam: numero,
            fir_match: fir,
            area_type: this.inferAreaType(item),
            valid_from: item.b ?? '',
            valid_to: item.c ?? '',
            q_line: item.cod ?? '',
            coords_latlon: isPolygon ? geometry.coords : [],
            texto_notam: item.e ?? '',
            f: item.f ?? '',
            g: item.g ?? '',
            source_id: item.id,
            geometry_type: isPolygon ? 'POLYGON' : 'CIRCLE',
            center: isCircle ? geometry.center : null,
            radius_m: isCircle ? geometry.radius_m : null,
            lido,
          } as AreaNotamApiModel)
        }
      }

      return grouped
    }

    return this.getAreasNotamAgrupadas(incluirLidos)
  }

  async importAeroviasAlta(): Promise<AeroviaLinhaModel[]> {
    return this.withFallback(
      'AEROVIAS_ALTA_URL',
      [],
      async () => this.loadAerovias(this.envService.aeroviasAltaUrl),
    )
  }

  async importAeroviasBaixa(): Promise<AeroviaLinhaModel[]> {
    return this.withFallback(
      'AEROVIAS_BAIXA_URL',
      [],
      async () => this.loadAerovias(this.envService.aeroviasBaixaUrl),
    )
  }

  async importAeroviasTodas(): Promise<AeroviasResponseModel> {
    const [alta, baixa] = await Promise.all([
      this.importAeroviasAlta(),
      this.importAeroviasBaixa(),
    ])

    return { alta, baixa }
  }

  async importAeroportos(): Promise<AeroportoModel[]> {
    return this.withFallback('AIRPORTS_URL', [], async () => {
      const csv = await this.fetchText(this.envService.airportsUrl)
      if (!csv.trim()) return []

      const lines = csv.split(/\r?\n/).filter((line) => line.trim())

      if (lines.length < 2) return []

      const headers = this.splitCsvLine(lines[0])
      const idxGpsCode = headers.indexOf('gps_code')
      const idxIdent = headers.indexOf('ident')
      const idxLocalCode = headers.indexOf('local_code')
      const idxLatitude = headers.indexOf('latitude_deg')
      const idxLongitude = headers.indexOf('longitude_deg')
      const idxIsoCountry = headers.indexOf('iso_country')
      const idxType = headers.indexOf('type')

      const byIcao = new Map<string, AeroportoModel>()

      for (let i = 1; i < lines.length; i++) {
        const cols = this.splitCsvLine(lines[i])

        const gpsCode = (cols[idxGpsCode] ?? '').trim().toUpperCase()
        const ident = (cols[idxIdent] ?? '').trim().toUpperCase()
        const localCode = (cols[idxLocalCode] ?? '').trim().toUpperCase()
        const icao = gpsCode || ident || localCode

        const isoCountry = (cols[idxIsoCountry] ?? '').trim().toUpperCase()
        const type = (cols[idxType] ?? '').trim().toLowerCase()
        const latitude = Number(cols[idxLatitude] ?? '')
        const longitude = Number(cols[idxLongitude] ?? '')

        if (!icao || !icao.startsWith('SB')) continue
        if (isoCountry !== 'BR') continue
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue
        if (type === 'closed') continue

        if (!byIcao.has(icao)) {
          byIcao.set(icao, {
            icao,
            latitude,
            longitude,
          })
        }
      }

      return Array.from(byIcao.values()).sort((a, b) =>
        a.icao.localeCompare(b.icao),
      )
    })
  }

  async importWaypoints(): Promise<WaypointModel[]> {
    return this.withFallback('WAYPOINTS_URL', [], async () => {
      const source = this.envService.waypointsUrl

      if (!source || !/^https?:\/\//i.test(source)) {
        return []
      }

      const buffer = await this.fetchBuffer(source)
      if (!buffer.length) return []

      const xlsx = await import('xlsx')
      const workbook = xlsx.read(buffer, { type: 'buffer' })
      const result = new Map<string, WaypointModel>()

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName]
        if (!sheet) continue

        const rows = xlsx.utils.sheet_to_json<unknown[]>(sheet, {
          header: 1,
          defval: '',
          raw: false,
        })

        for (const row of rows) {
          const waypoint = this.parseWaypointRow(row)

          if (!waypoint) continue
          if (!result.has(waypoint.ident)) {
            result.set(waypoint.ident, waypoint)
          }
        }
      }

      const waypoints = Array.from(result.values()).sort((a, b) =>
        a.ident.localeCompare(b.ident),
      )

      console.log(`[WAYPOINTS] Total carregado: ${waypoints.length}`)

      return waypoints
    })
  }

async importRpl(): Promise<RotaRplModel[]> {
  return this.withFallback('RPL_DATABASE', [], async () => {
    const [aeroportos, waypoints, dbResult] = await Promise.all([
      this.importAeroportos(),
      this.importWaypoints(),
      this.db.query<RplFlightDbRow>(
        `
          SELECT
            id,
            flight_number AS "flightNumber",
            equipment,
            start_date AS "startDate",
            end_date AS "endDate",
            is_monday AS "isMonday",
            is_tuesday AS "isTuesday",
            is_wednesday AS "isWednesday",
            is_thursday AS "isThursday",
            is_friday AS "isFriday",
            is_saturday AS "isSaturday",
            is_sunday AS "isSunday",
            departure,
            arrival,
            eobt,
            speed,
            flight_level AS "flightLevel",
            route,
            eet,
            remarks,
            original_line AS "originalLine"
          FROM rpl_flight
          ORDER BY flight_number, departure, arrival, eobt
        `,
      ),
    ])

    const airportMap = new Map<string, AeroportoModel>(
      aeroportos.map((airport): [string, AeroportoModel] => [
        this.normalizeIdent(airport.icao),
        airport,
      ]),
    )

    const waypointMap = new Map<string, WaypointModel>(
      waypoints.map((waypoint): [string, WaypointModel] => [
        this.normalizeIdent(waypoint.ident),
        waypoint,
      ]),
    )

    const result: RotaRplModel[] = []

    for (const row of dbResult.rows) {
      const rota = this.parseRplDbRow(row, airportMap, waypointMap)

      if (rota && rota.coords_latlon.length >= 2) {
        result.push(rota)
      }
    }

    console.log(`[RPL] Rotas carregadas do banco: ${result.length}`)

    return result
  })
}

private parseRplDbRow(
  row: RplFlightDbRow,
  airportMap: Map<string, AeroportoModel>,
  waypointMap: Map<string, WaypointModel>,
): RotaRplModel | null {
  const ident = this.normalizeIdent(row.flightNumber)
  const tipoAnv = this.cleanAircraftType(row.equipment ?? '')
  const origem = this.normalizeIdent(row.departure)
  const destino = this.normalizeIdent(row.arrival)
  const eobt = this.normalizeTime(row.eobt ?? '')
  const velocidade = this.normalizeIdent(row.speed ?? '')
  const nivel = this.extractFlightLevel(row.flightLevel ?? '')
  const rotaTextoOriginal = String(row.route ?? '').trim()
  const eet = this.normalizeTime(row.eet ?? '')

  if (!ident) return null
  if (!origem) return null
  if (!destino) return null
  if (!/^[A-Z]{4}$/.test(origem)) return null
  if (!/^[A-Z]{4}$/.test(destino)) return null

  const rotaTokens = this.cleanupRouteTokens(
    rotaTextoOriginal.split(/\s+/).filter(Boolean),
  )

  const pontos = this.resolveRoutePoints(
    origem,
    rotaTokens,
    destino,
    airportMap,
    waypointMap,
  )

  const coords = pontos.map((point) => [point.latitude, point.longitude] as LatLon)

  if (coords.length < 2) {
    return null
  }

  const totalDistanceNm = this.calculateTotalDistanceNm(coords)
  const eetMinutes = this.parseElapsedTimeToMinutes(row.eet ?? '')
  const speedKt = this.parseSpeedKt(velocidade)

  const totalFlightMinutes =
    eetMinutes > 0
      ? eetMinutes
      : speedKt > 0 && totalDistanceNm > 0
        ? Math.round((totalDistanceNm / speedKt) * 60)
        : 0

  const estimados = this.buildEstimatedPoints(
    pontos,
    eobt,
    totalFlightMinutes,
  )

  const eta =
    eobt && totalFlightMinutes > 0
      ? this.addMinutesToHhmm(eobt, totalFlightMinutes)
      : this.sumHhmm(eobt, eet)

  return {
    ident,
    tipo_anv: tipoAnv,
    nivel_voo: `${velocidade} ${nivel}`.trim(),
    origem,
    destino,
    eobt,
    eet,
    eta,
    rota_texto: rotaTokens.join(' '),
    linha_original: row.originalLine ?? '',
    coords_latlon: coords,
    estimados,
  }
}

  private async fetchJson<T>(url: string): Promise<T> {
    if (!url || !/^https?:\/\//i.test(url)) {
      throw new Error(`URL inválida: ${url}`)
    }

    const response = await this.fetchWithTimeout(url, 20000)

    if (!response.ok) {
      throw new Error(`Erro HTTP ${response.status} em ${url}`)
    }

    return response.json() as Promise<T>
  }

  private async fetchBuffer(source: string): Promise<Buffer> {
    if (/^https?:\/\//i.test(source)) {
      const response = await this.fetchWithTimeout(source, 20000)

      if (!response.ok) {
        throw new Error(`Erro HTTP ${response.status} em ${source}`)
      }

      const arrayBuffer = await response.arrayBuffer()
      return Buffer.from(arrayBuffer)
    }

    const path = await import('node:path')
    const filePath = path.join(process.cwd(), source)

    console.log('LENDO ARQUIVO BINARIO:', filePath)

    return readFile(filePath)
  }

  private async fetchText(source: string): Promise<string> {
    if (/^https?:\/\//i.test(source)) {
      const response = await this.fetchWithTimeout(source, 20000)

      if (!response.ok) {
        throw new Error(`Erro HTTP ${response.status} em ${source}`)
      }

      const buffer = await response.arrayBuffer()
      return Buffer.from(buffer).toString('latin1')
    }

    const path = await import('node:path')
    const filePath = path.join(process.cwd(), source)

    console.log('LENDO ARQUIVO:', filePath)

    return readFile(filePath, 'utf-8')
  }

  private toLatLonPair(coordinate: number[]): LatLon {
    return [Number(coordinate[1]), Number(coordinate[0])]
  }

  private extractAeroviaName(properties?: Record<string, any>): string {
    const candidates = [
      properties?.nome,
      properties?.name,
      properties?.ident,
      properties?.sigla,
      properties?.rota,
      properties?.designator,
      properties?.txtident,
      properties?.id,
      properties?.text_designator,
    ]

    for (const candidate of candidates) {
      if (
        candidate !== undefined &&
        candidate !== null &&
        String(candidate).trim()
      ) {
        return String(candidate).trim()
      }
    }

    return properties?.text_designator
      ? String(properties.text_designator).trim()
      : 'NOME DESCONHECIDO'
  }

  private geometryToLines(geometry?: GeoJsonGeometryModel | null): LatLon[][] {
    if (!geometry) return []

    if (geometry.type === 'LineString') {
      return [geometry.coordinates.map((point) => this.toLatLonPair(point))]
    }

    if (geometry.type === 'MultiLineString') {
      return geometry.coordinates.map((line) =>
        line.map((point) => this.toLatLonPair(point)),
      )
    }

    return []
  }

  private async loadAerovias(url: string): Promise<AeroviaLinhaModel[]> {
    const json = await this.fetchJson<GeoJsonResponseModel>(url)
    const features = Array.isArray(json.features) ? json.features : []

    const result: AeroviaLinhaModel[] = []

    for (const feature of features as GeoJsonFeatureModel[]) {
      const nome = this.extractAeroviaName(feature.properties)
      const lines = this.geometryToLines(feature.geometry)

      for (const line of lines) {
        if (line.length < 2) continue

        result.push({
          nome,
          coords_latlon: line,
        })
      }
    }

    return result
  }

  private splitCsvLine(line: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
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
    return result
  }

  private parseRplCsvRows(csv: string): string[][] {
    const lines = csv
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    const rows: string[][] = []

    for (const line of lines) {
      const cols = this.splitCsvLineByDelimiter(line, ';')

      if (cols.length < 20) {
        continue
      }

      rows.push(cols)
    }

    return rows
  }

  private splitCsvLineByDelimiter(line: string, delimiter: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
        continue
      }

      if (char === delimiter && !inQuotes) {
        result.push(current.trim())
        current = ''
        continue
      }

      current += char
    }

    result.push(current.trim())
    return result
  }

  private parseRplCsvRow(
    row: string[],
    airportMap: Map<string, AeroportoModel>,
    waypointMap: Map<string, WaypointModel>,
  ): RotaRplModel | null {
    const ident = this.normalizeIdent(row[10])
    const tipoAnv = this.cleanAircraftType(row[11] ?? '')
    const origem = this.normalizeIdent(row[13])
    const eobt = this.normalizeTime(row[14] ?? '')
    const velocidade = this.normalizeIdent(row[15])
    const nivel = this.extractFlightLevel(row[16] ?? '')
    const rotaTextoOriginal = String(row[17] ?? '').trim()
    const destino = this.normalizeIdent(row[18])
    const eet = this.normalizeTime(row[19] ?? '')

    if (!ident) return null
    if (!origem) return null
    if (!destino) return null
    if (!/^[A-Z]{4}$/.test(origem)) return null
    if (!/^[A-Z]{4}$/.test(destino)) return null

    const rotaTokens = this.cleanupRouteTokens(
      rotaTextoOriginal.split(/\s+/).filter(Boolean),
    )

    const pontos = this.resolveRoutePoints(
      origem,
      rotaTokens,
      destino,
      airportMap,
      waypointMap,
    )

    const coords = pontos.map((p) => [p.latitude, p.longitude] as LatLon)
    const totalDistanceNm = this.calculateTotalDistanceNm(coords)
    const eetMinutes = this.parseHhmmToMinutes(eet)
    const speedKt = this.parseSpeedKt(velocidade)

    const totalFlightMinutes =
      eetMinutes > 0
        ? eetMinutes
        : speedKt > 0 && totalDistanceNm > 0
          ? Math.round((totalDistanceNm / speedKt) * 60)
          : 0

    const estimados = this.buildEstimatedPoints(
      pontos,
      eobt,
      totalFlightMinutes,
    )

    const eta =
      eobt && totalFlightMinutes > 0
        ? this.addMinutesToHhmm(eobt, totalFlightMinutes)
        : this.sumHhmm(eobt, eet)

    return {
      ident,
      tipo_anv: tipoAnv,
      nivel_voo: `${velocidade} ${nivel}`.trim(),
      origem,
      destino,
      eobt,
      eet,
      eta,
      rota_texto: rotaTokens.join(' '),
      linha_original: row.join(';'),
      coords_latlon: coords,
      estimados,
    }
  }

  private parseRplRecords(text: string): string[] {
    const lines = text.split(/\r?\n/)
    const registros: string[] = []
    let atual = ''

    for (const rawLine of lines) {
      const line = rawLine.replace(/\t/g, '    ').replace(/\s+$/, '')
      const trimmed = line.trim()

      if (!trimmed) continue
      if (this.shouldSkipRplLine(trimmed)) continue

      const isLinhaPrincipal =
        /^\d{6}\s+\d{6}\s+\d{7}\s+[A-Z]{2,3}\d{1,4}[A-Z]?\s+/i.test(trimmed)

      if (isLinhaPrincipal) {
        if (atual) {
          registros.push(atual)
        }
        atual = trimmed
        continue
      }

      if (atual) {
        atual += ` ${trimmed}`
      }
    }

    if (atual) {
      registros.push(atual)
    }

    return registros
  }

  private shouldSkipRplLine(line: string): boolean {
    const upper = line.toUpperCase()

    if (!upper) return true
    if (upper.includes('PLANOS DE VOO REPETITIVOS')) return true
    if (upper.includes('CLASSIFICA')) return true
    if (upper.startsWith('CIA:')) return true
    if (upper.includes('INÍCIO DE VALIDADE')) return true
    if (upper.includes('PAG.:')) return true
    if (upper.includes('VALIDO VALIDO DIAS OP')) return true
    if (upper.includes('DEST') && upper.includes('OBSERVACOES')) return true
    if (upper.includes('DESDE') && upper.includes('ATE') && upper.includes('EOBT')) {
      return true
    }
    if (/^[-=]{3,}$/.test(upper)) return true

    return false
  }

  private parseRplRecord(
    registro: string,
    airportMap: Map<string, AeroportoModel>,
    waypointMap: Map<string, WaypointModel>,
  ): RotaRplModel | null {
    const partes = registro.split(/\s+/).filter(Boolean)
    if (partes.length < 8) return null

    const identInfo = this.extractFlightNumber(partes)
    if (!identInfo.ident || identInfo.index < 0) return null

    const tipoAnv =
      identInfo.index + 1 < partes.length
        ? this.cleanAircraftType(partes[identInfo.index + 1])
        : ''

    const adepInfo = this.findFirstAdep(partes, identInfo.index + 2)
    if (!adepInfo) return null

    const idxVel = partes.findIndex(
      (token, idx) => idx > adepInfo.index && /^N\d{4}$/i.test(token),
    )
    if (idxVel < 0) return null

    const velocidade = partes[idxVel].toUpperCase()
    const nivelVoo =
      idxVel + 1 < partes.length ? this.extractFlightLevel(partes[idxVel + 1]) : ''
    const rotaInicio = idxVel + 2

    const destInfo = this.findDestinationFromTail(partes, rotaInicio)
    if (!destInfo) return null

    const rotaBruta = partes.slice(rotaInicio, destInfo.index)
    const rotaTokens = this.cleanupRouteTokens(rotaBruta)
    const pontos = this.resolveRoutePoints(
      adepInfo.icao,
      rotaTokens,
      destInfo.icao,
      airportMap,
      waypointMap,
    )
    const coords = pontos.map((point) => [point.latitude, point.longitude] as LatLon)
    const totalDistanceNm = this.calculateTotalDistanceNm(coords)
    const eetMinutes = this.parseHhmmToMinutes(destInfo.hora)
    const speedKt = this.parseSpeedKt(velocidade)

    const totalFlightMinutes =
      eetMinutes > 0
        ? eetMinutes
        : speedKt > 0 && totalDistanceNm > 0
          ? Math.round((totalDistanceNm / speedKt) * 60)
          : 0

    const estimados = this.buildEstimatedPoints(
      pontos,
      adepInfo.hora,
      totalFlightMinutes,
    )

    const eta =
      totalFlightMinutes > 0
        ? this.addMinutesToHhmm(adepInfo.hora, totalFlightMinutes)
        : this.sumHhmm(adepInfo.hora, destInfo.hora)

    return {
      ident: identInfo.ident,
      tipo_anv: tipoAnv,
      nivel_voo: `${velocidade} ${nivelVoo}`.trim(),
      origem: adepInfo.icao,
      destino: destInfo.icao,
      eobt: adepInfo.hora,
      eet: destInfo.hora,
      eta,
      rota_texto: rotaTokens.join(' '),
      linha_original: registro,
      coords_latlon: coords,
      estimados,
    }
  }

  private resolveRouteCoordinates(
    origem: string,
    rotaTokens: string[],
    destino: string,
    airportMap: Map<string, AeroportoModel>,
    waypointMap: Map<string, WaypointModel>,
  ): LatLon[] {
    const points = this.buildRoutePointSequence(
      origem,
      rotaTokens,
      destino,
      airportMap,
      waypointMap,
    )

    const coords: LatLon[] = []
    const seen = new Set<string>()

    for (const point of points) {
      const airport = airportMap.get(point)
      if (airport) {
        this.pushUniqueRouteCoord(coords, seen, [
          airport.latitude,
          airport.longitude,
        ])
        continue
      }

      const waypoint = waypointMap.get(point)
      if (waypoint) {
        this.pushUniqueRouteCoord(coords, seen, [
          waypoint.latitude,
          waypoint.longitude,
        ])
      }
    }

    return coords
  }

  private resolveRoutePoints(
    origem: string,
    rotaTokens: string[],
    destino: string,
    airportMap: Map<string, AeroportoModel>,
    waypointMap: Map<string, WaypointModel>,
  ): Array<{
    ident: string
    latitude: number
    longitude: number
  }> {
    const sequence = this.buildRoutePointSequence(
      origem,
      rotaTokens,
      destino,
      airportMap,
      waypointMap,
    )

    const points: Array<{
      ident: string
      latitude: number
      longitude: number
    }> = []
    const seen = new Set<string>()

    for (const ident of sequence) {
      const airport = airportMap.get(ident)
      if (airport) {
        this.pushUniqueRoutePoint(points, seen, {
          ident,
          latitude: airport.latitude,
          longitude: airport.longitude,
        })
        continue
      }

      const waypoint = waypointMap.get(ident)
      if (waypoint) {
        this.pushUniqueRoutePoint(points, seen, {
          ident,
          latitude: waypoint.latitude,
          longitude: waypoint.longitude,
        })
      }
    }

    return points
  }

  private pushUniqueRoutePoint(
    points: Array<{
      ident: string
      latitude: number
      longitude: number
    }>,
    seen: Set<string>,
    point: {
      ident: string
      latitude: number
      longitude: number
    },
  ) {
    if (!point.ident) return
    if (!Number.isFinite(point.latitude)) return
    if (!Number.isFinite(point.longitude)) return

    const key = `${point.ident}:${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`
    if (seen.has(key)) return

    seen.add(key)
    points.push(point)
  }

private buildEstimatedPoints(
  points: Array<{
    ident: string
    latitude: number
    longitude: number
  }>,
  eobt: string,
  totalFlightMinutes: number,
): Array<{
  ident: string
  latitude: number
  longitude: number
  distancia_acumulada_nm: number
  tempo_acumulado_min: number
  estimado: string
}> {
  if (!points.length) {
    return []
  }

  const distances: number[] = [0]
  let totalDistanceNm = 0

  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1]
    const current = points[i]

    const legDistanceNm = this.distanceNm(
      [previous.latitude, previous.longitude],
      [current.latitude, current.longitude],
    )

    totalDistanceNm += legDistanceNm
    distances.push(totalDistanceNm)
  }

  return points.map((point, index) => {
    const accumulatedDistance = distances[index] ?? 0

    const accumulatedMinutes =
      index === 0
        ? 0
        : totalDistanceNm > 0 && totalFlightMinutes > 0
          ? Math.round((accumulatedDistance / totalDistanceNm) * totalFlightMinutes)
          : 0

    return {
      ident: point.ident,
      latitude: point.latitude,
      longitude: point.longitude,
      distancia_acumulada_nm: Number(accumulatedDistance.toFixed(1)),
      tempo_acumulado_min: accumulatedMinutes,
      estimado: eobt ? this.addMinutesToHhmm(eobt, accumulatedMinutes) : '',
    }
  })
}

  private calculateTotalDistanceNm(coords: LatLon[]): number {
    let total = 0

    for (let i = 1; i < coords.length; i++) {
      total += this.distanceNm(coords[i - 1], coords[i])
    }

    return total
  }

  private distanceNm(from: LatLon, to: LatLon): number {
    const lat1 = this.toRadians(from[0])
    const lon1 = this.toRadians(from[1])
    const lat2 = this.toRadians(to[0])
    const lon2 = this.toRadians(to[1])

    const dLat = lat2 - lat1
    const dLon = lon2 - lon1

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) *
        Math.cos(lat2) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2)

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    const meters = this.EARTH_RADIUS_M * c

    return meters / this.NM_TO_M
  }

  private normalizeTime(value: string): string {
    const text = String(value ?? '').trim()
    if (!text) return ''

    const onlyDigits = text.replace(/\D/g, '')

    if (/^\d{4}$/.test(onlyDigits)) return onlyDigits
    if (/^\d{3}$/.test(onlyDigits)) return `0${onlyDigits}`
    if (/^\d{1,2}$/.test(onlyDigits)) return onlyDigits.padStart(4, '0')

    return text
  }

private parseElapsedTimeToMinutes(value: string): number {
  const raw = String(value ?? '').trim().toUpperCase()

  if (!raw) {
    return 0
  }

  const cleaned = raw
    .replace(/UTC/g, '')
    .replace(/Z/g, '')
    .replace(/\s+/g, '')
    .replace(',', '.')
    .trim()

  const colonMatch = cleaned.match(/^(\d{1,2}):(\d{2})$/)
  if (colonMatch) {
    const hours = Number(colonMatch[1])
    const minutes = Number(colonMatch[2])

    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0
    if (minutes < 0 || minutes > 59) return 0

    return hours * 60 + minutes
  }

  const hMatch = cleaned.match(/^(\d{1,2})H(\d{0,2})?M?$/)
  if (hMatch) {
    const hours = Number(hMatch[1])
    const minutes = hMatch[2] ? Number(hMatch[2]) : 0

    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0
    if (minutes < 0 || minutes > 59) return 0

    return hours * 60 + minutes
  }

  const dotMatch = cleaned.match(/^(\d{1,2})\.(\d{2})$/)
  if (dotMatch) {
    const hours = Number(dotMatch[1])
    const minutes = Number(dotMatch[2])

    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0
    if (minutes < 0 || minutes > 59) return 0

    return hours * 60 + minutes
  }

  const digits = cleaned.replace(/\D/g, '')

  if (!digits) {
    return 0
  }

  if (digits.length <= 2) {
    return Number(digits)
  }

  if (digits.length === 3) {
    const hours = Number(digits.slice(0, 1))
    const minutes = Number(digits.slice(1, 3))

    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0
    if (minutes < 0 || minutes > 59) return 0

    return hours * 60 + minutes
  }

  if (digits.length === 4) {
    const hours = Number(digits.slice(0, 2))
    const minutes = Number(digits.slice(2, 4))

    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0
    if (minutes < 0 || minutes > 59) return 0

    return hours * 60 + minutes
  }

  return 0
}

  private parseHhmmToMinutes(value: string): number {
    const text = this.normalizeTime(value)

    if (!/^\d{4}$/.test(text)) {
      return 0
    }

    const hours = Number(text.slice(0, 2))
    const minutes = Number(text.slice(2, 4))

    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0
    if (minutes < 0 || minutes > 59) return 0

    return hours * 60 + minutes
  }

  private addMinutesToHhmm(value: string, minutesToAdd: number): string {
    const normalized = this.normalizeTime(value)

    if (!/^\d{4}$/.test(normalized)) {
      return ''
    }

    const base = this.parseHhmmToMinutes(normalized)
    const total = ((base + minutesToAdd) % 1440 + 1440) % 1440
    const hours = Math.floor(total / 60)
    const minutes = total % 60

    return `${String(hours).padStart(2, '0')}${String(minutes).padStart(2, '0')}`
  }

  private parseSpeedKt(value: string): number {
    const text = String(value ?? '').trim().toUpperCase()
    if (!text) return 0

    const nMatch = text.match(/^N(\d{4})$/)
    if (nMatch) return Number(nMatch[1])

    const plain = text.match(/^(\d{3,4})$/)
    if (plain) return Number(plain[1])

    return 0
  }

  private buildRoutePointSequence(
    origem: string,
    rotaTokens: string[],
    destino: string,
    airportMap: Map<string, AeroportoModel>,
    waypointMap: Map<string, WaypointModel>,
  ): string[] {
    const points: string[] = []

    this.pushUniquePoint(points, origem)

    for (const token of rotaTokens) {
      if (airportMap.has(token) || waypointMap.has(token)) {
        this.pushUniquePoint(points, token)
      }
    }

    this.pushUniquePoint(points, destino)

    return points
  }

  private pushUniquePoint(points: string[], value: string) {
    const normalized = this.normalizeIdent(value)
    if (!normalized) return
    if (points[points.length - 1] === normalized) return
    points.push(normalized)
  }

  private pushUniqueRouteCoord(
    coords: LatLon[],
    seen: Set<string>,
    coord: LatLon,
  ) {
    if (!this.isFiniteCoord(coord)) return

    const key = `${coord[0].toFixed(6)},${coord[1].toFixed(6)}`
    if (seen.has(key)) return

    seen.add(key)
    coords.push(coord)
  }

  private findFirstAdep(
    partes: string[],
    startIndex: number,
  ): { icao: string; hora: string; index: number } | null {
    for (let i = startIndex; i < partes.length; i++) {
      const found = this.extractIcaoWithTime(partes[i])
      if (found) {
        return {
          ...found,
          index: i,
        }
      }
    }

    return null
  }

  private findDestinationFromTail(
    partes: string[],
    routeStartIndex: number,
  ): { icao: string; hora: string; index: number } | null {
    for (let i = partes.length - 1; i >= routeStartIndex; i--) {
      const found = this.extractIcaoWithTime(partes[i])
      if (found) {
        const prev = i > 0 ? partes[i - 1].trim().toUpperCase() : ''
        const next = i + 1 < partes.length ? partes[i + 1].trim().toUpperCase() : ''

        if (prev.startsWith('EET/')) continue
        if (next.startsWith('EET/')) continue

        return {
          ...found,
          index: i,
        }
      }
    }

    return null
  }

  private extractIcaoWithTime(token: string): { icao: string; hora: string } | null {
    const t = token.trim().toUpperCase()
    const match = t.match(/^([A-Z]{4})(\d{4})$/)
    if (!match) return null

    return {
      icao: match[1],
      hora: match[2],
    }
  }

  private extractFlightLevel(token: string): string {
    const t = String(token ?? '').trim().toUpperCase()

    if (!t) return ''

    if (/^\d{2,4}$/.test(t)) {
      return t
    }

    const matchF = t.match(/^F(\d{3,4})$/)
    if (matchF) return matchF[1]

    const matchNF = t.match(/[NF]\d{4}F(\d{3,4})/)
    if (matchNF) return matchNF[1]

    return t
  }

  private extractFlightNumber(partes: string[]): { ident: string; index: number } {
    for (let i = 0; i < partes.length; i++) {
      const t = String(partes[i]).trim().toUpperCase()

      if (/^[A-Z]{2,3}\d{4}[A-Z]?$/.test(t)) {
        return { ident: t, index: i }
      }
    }

    return { ident: '', index: -1 }
  }

  private cleanAircraftType(token: string): string {
    const t = String(token).trim().toUpperCase()
    if (t.includes('/')) {
      return t.split('/', 1)[0]
    }
    return t
  }

  private isAirwayToken(token: string): boolean {
    return /^[A-Z]{1,3}\d{1,4}[A-Z]?$/.test(token)
  }

  private isValidRouteToken(token: string): boolean {
    if (!token) return false
    if (
      token === 'DCT' ||
      token === 'IFR' ||
      token === 'VFR' ||
      token === 'C' ||
      token === 'NIL'
    ) {
      return false
    }
    if (/^N\d{4}$/i.test(token)) return false
    if (/^K\d{4}$/i.test(token)) return false
    if (/^M\d{3}$/i.test(token)) return false
    if (/^F\d{3,4}$/i.test(token)) return false
    if (/^A\d{3,4}$/i.test(token)) return false
    if (/^S\d{3,4}$/i.test(token)) return false
    if (/^\d{2,4}$/.test(token)) return false
    if (/^[A-Z]{4}\d{4}$/.test(token)) return false
    if (this.isAirwayToken(token)) return false
    if (/^EQPT$/i.test(token)) return false
    if (/^PBN$/i.test(token)) return false
    if (/^EET$/i.test(token)) return false
    if (/^DOF$/i.test(token)) return false
    if (/^STS$/i.test(token)) return false
    if (/^RMK$/i.test(token)) return false
    if (/^REG$/i.test(token)) return false
    if (/^SEL$/i.test(token)) return false
    if (/^OPR$/i.test(token)) return false
    if (/^ORGN$/i.test(token)) return false
    if (/^RALT$/i.test(token)) return false
    if (/^TALT$/i.test(token)) return false
    if (/^CODE$/i.test(token)) return false
    if (/^NAV$/i.test(token)) return false
    if (/^COM$/i.test(token)) return false
    if (/^DAT$/i.test(token)) return false
    if (/^SUR$/i.test(token)) return false
    if (/^DEP$/i.test(token)) return false
    if (/^DEST$/i.test(token)) return false
    if (/^ALTN$/i.test(token)) return false
    if (/^TYP$/i.test(token)) return false
    if (/^RIF$/i.test(token)) return false
    if (/^EQPT\/.+/i.test(token)) return false
    if (/^PBN\/.+/i.test(token)) return false
    if (/^EET\/.+/i.test(token)) return false
    if (/^STS\/.+/i.test(token)) return false
    if (/^RMK\/.+/i.test(token)) return false
    if (/^DOF\/.+/i.test(token)) return false
    return true
  }

  private cleanupRouteTokens(tokens: string[]): string[] {
    const result: string[] = []

    for (const raw of tokens) {
      const token = this.normalizeIdent(raw)
      if (!token) continue

      const normalized = token.replace(/[.,;]+$/g, '')

      if (normalized.includes('/')) {
        const left = normalized.split('/', 1)[0]
        if (this.isValidRouteToken(left)) {
          result.push(left)
        }
        continue
      }

      if (this.isValidRouteToken(normalized)) {
        result.push(normalized)
      }
    }

    return result
  }

  private sumHhmm(hora1: string, hora2: string): string {
    if (!hora1 || !hora2) return ''
    if (!/^\d{4}$/.test(hora1)) return ''
    if (!/^\d{4}$/.test(hora2)) return ''

    const h1 = Number(hora1.slice(0, 2))
    const m1 = Number(hora1.slice(2))
    const h2 = Number(hora2.slice(0, 2))
    const m2 = Number(hora2.slice(2))

    const total = (h1 * 60 + m1 + h2 * 60 + m2) % (24 * 60)
    const hh = Math.floor(total / 60)
    const mm = total % 60

    return `${String(hh).padStart(2, '0')}${String(mm).padStart(2, '0')}`
  }

  private parseWaypointRow(row: unknown[]): WaypointModel | null {
    if (!Array.isArray(row) || row.length < 3) {
      return null
    }

    const ident = this.extractWaypointIdentFromArray(row)
    const coordinate = this.extractWaypointCoordinateFromArray(row)

    if (!ident) return null
    if (!coordinate) return null

    return {
      ident,
      latitude: coordinate[0],
      longitude: coordinate[1],
    }
  }

  private extractWaypointIdentFromArray(row: unknown[]): string {
    for (const value of row) {
      const text = this.normalizeIdent(String(value ?? ''))

      if (/^[A-Z]{5}$/.test(text)) {
        return text
      }
    }

    return ''
  }

  private extractWaypointCoordinateFromArray(row: unknown[]): LatLon | null {
    const numericCoords: number[] = []
    const dmsLat: number[] = []
    const dmsLon: number[] = []

    for (const value of row) {
      const text = String(value ?? '').trim()
      if (!text) continue

      const dms = this.parseSingleDmsCoordinate(text)
      if (Number.isFinite(dms)) {
        if (/[NS]/i.test(text)) {
          dmsLat.push(dms)
        }
        if (/[EW]/i.test(text)) {
          dmsLon.push(dms)
        }
        continue
      }

      const numeric = this.parseDecimalCoordinate(text)
      if (Number.isFinite(numeric)) {
        numericCoords.push(numeric)
      }
    }

    if (dmsLat.length && dmsLon.length) {
      const coord: LatLon = [dmsLat[0], dmsLon[0]]
      return this.isFiniteCoord(coord) ? coord : null
    }

    for (let i = 0; i < numericCoords.length - 1; i++) {
      const lat = numericCoords[i]
      const lon = numericCoords[i + 1]
      const coord: LatLon = [lat, lon]

      if (this.isFiniteCoord(coord)) {
        return coord
      }
    }

    return null
  }

  private parseDecimalCoordinate(value: unknown): number {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : Number.NaN
    }

    const text = String(value ?? '').trim()
    if (!text) return Number.NaN

    if (/[°'"NSWE]/i.test(text)) {
      return Number.NaN
    }

    const normalized = text.replace(',', '.')
    const parsed = Number(normalized)

    if (!Number.isFinite(parsed)) {
      return Number.NaN
    }

    if (Math.abs(parsed) > 180) {
      return Number.NaN
    }

    return parsed
  }

  private parseSingleDmsCoordinate(value: unknown): number {
    const text = String(value ?? '').trim().toUpperCase()
    if (!text) return Number.NaN

    const match = text.match(/^(\d{1,3})\D+(\d{1,2})\D+(\d{1,2}(?:[.,]\d+)?)\D*([NSWE])$/)
    if (!match) return Number.NaN

    const deg = Number(match[1])
    const min = Number(match[2])
    const sec = Number(match[3].replace(',', '.'))
    const hemi = match[4]

    if (!Number.isFinite(deg)) return Number.NaN
    if (!Number.isFinite(min)) return Number.NaN
    if (!Number.isFinite(sec)) return Number.NaN

    return this.dmsToDecimal(deg, min, sec, hemi)
  }

}