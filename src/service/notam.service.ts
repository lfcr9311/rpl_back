import { Injectable } from '@nestjs/common'
import { XMLParser } from 'fast-xml-parser'
import { readFile } from 'node:fs/promises'
import * as XLSX from 'xlsx'
import { EnvService } from '../config/env.service'
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

@Injectable()
export class NotamsService {
  constructor(
    private readonly envService: EnvService,
  ) { }

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

  private parseNotamDate(raw?: string | null): Date | null {
    if (!raw) return null

    const value = String(raw).trim().toUpperCase()

    if (!value || value === 'PERM' || value === 'UFN') {
      return null
    }

    if (/^\d{10}$/.test(value)) {
      const year = 2000 + Number(value.slice(0, 2))
      const month = Number(value.slice(2, 4)) - 1
      const day = Number(value.slice(4, 6))
      const hour = Number(value.slice(6, 8))
      const minute = Number(value.slice(8, 10))
      return new Date(Date.UTC(year, month, day, hour, minute))
    }

    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) {
      return null
    }

    return parsed
  }

  private isNotamWithinCurrentWindow(item: AiswebItemModel, now = new Date()): boolean {
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
      value.includes('WI COORD') ||
      value.includes('CENTRO COORD') ||
      value.includes('COORD ') ||
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

  private inferAreaKindFromQCode(qcode?: string | null, textE?: string | null): AreaKind {
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

  private async fetchWithTimeout(url: string, timeoutMs = 20000): Promise<Response> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    try {
      return await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          Accept: 'application/xml,text/xml,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
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
        console.log(`[NOTAM] Erro ao consultar ${firLabel} na tentativa ${attempt}:`, error)

        if (attempt < maxAttempts) {
          const waitMs = attempt * 2000
          console.log(`[NOTAM] Nova tentativa para ${firLabel} em ${waitMs}ms`)
          await this.sleep(waitMs)
        }
      }
    }

    throw lastError
  }

  async fetchRemoteNotams(icaocode?: string, minutes?: number): Promise<AiswebItemModel[]> {
    const xml = await this.fetchRemoteNotamsXml(icaocode, minutes)
    const items = this.normalizeItems(xml)

    console.log('[NOTAM] Total bruto recebido da API:', items.length)
    return items
  }

  async fetchRemoteNotamsFromAllTargetFirs(minutes?: number): Promise<AiswebItemModel[]> {
    const allItems: AiswebItemModel[] = []

    for (const fir of this.targetFirs) {
      try {
        const items = await this.fetchRemoteNotams(fir, minutes)
        console.log(`[NOTAM] ${fir}: ${items.length} itens`)
        allItems.push(...items)
      } catch (error) {
        console.log(`[NOTAM] Falha final ao consultar ${fir}:`, error)
      }
    }

    return allItems
  }

  async getRemoteNotams(params?: {
    icaocode?: string
    minutes?: number
  }): Promise<NotamModel[]> {
    const items = await this.fetchRemoteNotams(params?.icaocode, params?.minutes)

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

      if (parsed?.type === 'MultiPolygon' && Array.isArray(parsed.coordinates?.[0]?.[0])) {
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

  private parseGeoCircle(raw?: string | null): { center: LatLon; radius_m: number } | null {
    const value = String(raw ?? '').trim().toUpperCase()
    if (!value) return null

    const match = value.match(
      /^(\d{2})(\d{2})([NS])(\d{3})(\d{2})([EW])(\d{3})$/,
    )

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

    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(radius_m)) {
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

    const lat2 = Math.asin(
      sinLat1 * cosAd + cosLat1 * sinAd * Math.cos(bearing),
    )

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
        this.destinationPoint(center, this.normalizeBearing(bearing), radiusMeters),
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

    const geo = String(item.geo ?? '').trim()
    const textE = String(item.e ?? '').trim()

    if (textE) {
      if (this.textUsesBorderClosure(textE)) {
        console.log('[NOTAM] geometria depende de fechamento por fronteira terrestre')
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
      if (textCoords.length >= 3) {
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
      if (geoJsonCoords.length >= 3) {
        return {
          parser: 'geojson',
          coords: geoJsonCoords,
          center: null,
          radius_m: null,
        }
      }

      const wktCoords = this.parseWktPolygon(geo)
      if (wktCoords.length >= 3) {
        return {
          parser: 'wkt',
          coords: wktCoords,
          center: null,
          radius_m: null,
        }
      }

      const dmsCoords = this.parseDmsSequence(geo)
      if (dmsCoords.length >= 3) {
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

  async findAreasFromApiByTargetFirs(minutes?: number): Promise<Record<string, AreaNotamApiModel[]>> {
    const items = await this.fetchRemoteNotamsFromAllTargetFirs(minutes)

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

      if (!resolvedFirs.length) continue
      if (!this.isNotamWithinCurrentWindow(item)) continue
      if (this.isIgnoredQCode(qcode)) continue
      if (!this.isAreaQCode(qcode, item.e)) continue

      const geometry = this.extractGeometryFromItem(item)

      if (geometry.parser === 'ignored-qcode') continue
      if (geometry.parser === 'border-closure-unsupported') continue

      if (
        geometry.parser !== 'circle' &&
        this.isPolygonParser(geometry.parser) &&
        geometry.coords.length < 4
      ) {
        continue
      }

      if (geometry.parser === 'none') continue

      if (
        geometry.parser === 'circle' &&
        (!geometry.center || !geometry.radius_m)
      ) {
        continue
      }

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
          coords_latlon: geometry.coords,
          texto_notam: item.e ?? '',
          source_id: item.id,
          geometry_type: geometry.parser === 'circle' ? 'CIRCLE' : 'POLYGON',
          center: geometry.center,
          radius_m: geometry.radius_m,
        } as AreaNotamApiModel)
      }
    }

    return grouped
  }

  async importAeroviasAlta(): Promise<AeroviaLinhaModel[]> {
    return this.loadAerovias(this.envService.aeroviasAltaUrl)
  }

  async importAeroviasBaixa(): Promise<AeroviaLinhaModel[]> {
    return this.loadAerovias(this.envService.aeroviasBaixaUrl)
  }

  async importAeroviasTodas(): Promise<AeroviasResponseModel> {
    const [alta, baixa] = await Promise.all([
      this.importAeroviasAlta(),
      this.importAeroviasBaixa(),
    ])

    return { alta, baixa }
  }

  async importAeroviasUruguay(): Promise<AeroviaUruguayModel[]> {
    const csv = await this.fetchText(this.envService.aeroviasUruguayCsvPath)
    const lines = csv.split(/\r?\n/).filter((line) => line.trim())

    if (lines.length < 2) {
      return []
    }

    const headers = this.splitCsvLine(lines[0]).map((header) => header.trim())

    const idxRoute = headers.indexOf('route')
    const idxSection = headers.indexOf('section')
    const idxSeq = headers.indexOf('seq')
    const idxWaypointName = headers.indexOf('waypoint_name')
    const idxDetail = headers.indexOf('detail')
    const idxCoordDms = headers.indexOf('coord_dms')
    const idxLatitude = headers.indexOf('latitude')
    const idxLongitude = headers.indexOf('longitude')
    const idxPage = headers.indexOf('page')
    const idxEffectiveDate = headers.indexOf('effective_date')
    const idxSourceFile = headers.indexOf('source_file')

    if (
      idxRoute < 0 ||
      idxSection < 0 ||
      idxSeq < 0 ||
      idxWaypointName < 0 ||
      idxLatitude < 0 ||
      idxLongitude < 0
    ) {
      throw new Error('CSV de aerovias do Uruguai inválido')
    }

    const rows: AeroviaUruguayCsvRowModel[] = []

    for (let i = 1; i < lines.length; i++) {
      const cols = this.splitCsvLine(lines[i])

      const route = String(cols[idxRoute] ?? '').trim().toUpperCase()
      const section = String(cols[idxSection] ?? '').trim()
      const seq = Number(cols[idxSeq] ?? '')
      const waypointName = String(cols[idxWaypointName] ?? '').trim().toUpperCase()
      const detail = String(cols[idxDetail] ?? '').trim()
      const coordDms = String(cols[idxCoordDms] ?? '').trim()
      const latitude = Number(String(cols[idxLatitude] ?? '').replace(',', '.'))
      const longitude = Number(String(cols[idxLongitude] ?? '').replace(',', '.'))
      const page = Number(cols[idxPage] ?? '0')
      const effectiveDate = String(cols[idxEffectiveDate] ?? '').trim()
      const sourceFile = String(cols[idxSourceFile] ?? '').trim()

      if (!route) continue
      if (!Number.isFinite(seq)) continue
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue

      rows.push({
        route,
        section,
        seq,
        waypoint_name: waypointName,
        detail,
        coord_dms: coordDms,
        latitude,
        longitude,
        page,
        effective_date: effectiveDate,
        source_file: sourceFile,
      })
    }

    const grouped = new Map<string, AeroviaUruguayCsvRowModel[]>()

    for (const row of rows) {
      if (!grouped.has(row.route)) {
        grouped.set(row.route, [])
      }

      grouped.get(row.route)!.push(row)
    }

    const result: AeroviaUruguayModel[] = []

    for (const [route, routeRows] of grouped.entries()) {
      const ordered = [...routeRows].sort((a, b) => a.seq - b.seq)

      result.push({
        nome: route,
        section: ordered[0]?.section ?? '',
        coords_latlon: ordered.map((row) => [row.latitude, row.longitude]),
        waypoints: ordered.map((row) => ({
          seq: row.seq,
          nome: row.waypoint_name,
          detail: row.detail,
          coord_dms: row.coord_dms,
          latitude: row.latitude,
          longitude: row.longitude,
          page: row.page,
          effective_date: row.effective_date,
          source_file: row.source_file,
        })),
      })
    }

    return result.sort((a, b) => a.nome.localeCompare(b.nome))
  }

  async importAeroportos(): Promise<AeroportoModel[]> {
    const csv = await this.fetchText(this.envService.airportsUrl)
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

    return Array.from(byIcao.values()).sort((a, b) => a.icao.localeCompare(b.icao))
  }

  async importWaypoints(): Promise<WaypointModel[]> {
    const workbook = XLSX.readFile(this.envService.waypointsUrl)
    const firstSheet = workbook.SheetNames[0]

    if (!firstSheet) return []

    const sheet = workbook.Sheets[firstSheet]
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: '',
      raw: false,
    })

    const byIdent = new Map<string, WaypointModel>()

    for (const row of rows) {
      const ident = String(row.ident ?? '').trim().toUpperCase()
      const latitude = Number(String(row.latitude ?? '').replace(',', '.'))
      const longitude = Number(String(row.longitude ?? '').replace(',', '.'))

      if (!ident) continue
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue

      if (!byIdent.has(ident)) {
        byIdent.set(ident, {
          ident,
          latitude,
          longitude,
        })
      }
    }

    return Array.from(byIdent.values()).sort((a, b) => a.ident.localeCompare(b.ident))
  }

  async importRpl(): Promise<RotaRplModel[]> {
    const [text, aeroportos, waypoints] = await Promise.all([
      this.fetchText(this.envService.rplUrl),
      this.importAeroportos(),
      this.importWaypoints(),
    ])

    const airportMap = new Map(aeroportos.map((a) => [a.icao, a]))
    const waypointMap = new Map(waypoints.map((w) => [w.ident, w]))
    const registros = this.parseRplRecords(text)
    const result: RotaRplModel[] = []

    for (const registro of registros) {
      const rota = this.parseRplRecord(registro, airportMap, waypointMap)
      if (rota && rota.coords_latlon.length >= 2) {
        result.push(rota)
      }
    }

    return result
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const response = await this.fetchWithTimeout(url, 20000)

    if (!response.ok) {
      throw new Error(`Erro HTTP ${response.status} em ${url}`)
    }

    return response.json() as Promise<T>
  }

  private async fetchText(source: string): Promise<string> {
    if (/^https?:\/\//i.test(source)) {
      const response = await this.fetchWithTimeout(source, 20000)

      if (!response.ok) {
        throw new Error(`Erro HTTP ${response.status} em ${source}`)
      }

      return response.text()
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
      if (candidate !== undefined && candidate !== null && String(candidate).trim()) {
        return String(candidate).trim()
      }
    }

    return properties?.text_designator ? String(properties.text_designator).trim() : 'NOME DESCONHECIDO'
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
    if (upper.includes('INÃ')) return true
    if (upper.includes('PAG.:')) return true
    if (upper.includes('VALIDO VALIDO DIAS OP')) return true
    if (upper.includes('DEST') && upper.includes('OBSERVACOES')) return true
    if (upper.includes('DESDE') && upper.includes('ATE') && upper.includes('EOBT')) return true
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
    const coords = this.resolveRouteCoordinates(
      adepInfo.icao,
      rotaTokens,
      destInfo.icao,
      airportMap,
      waypointMap,
    )

    const eta = this.sumHhmm(adepInfo.hora, destInfo.hora)

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

    for (const point of points) {
      const airport = airportMap.get(point)
      if (airport) {
        coords.push([airport.latitude, airport.longitude])
        continue
      }

      const waypoint = waypointMap.get(point)
      if (waypoint) {
        coords.push([waypoint.latitude, waypoint.longitude])
      }
    }

    return coords
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
    const normalized = String(value ?? '').trim().toUpperCase()
    if (!normalized) return
    if (points[points.length - 1] === normalized) return
    points.push(normalized)
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
    return /^[A-Z]{1,3}\d{1,4}$/.test(token)
  }

  private isValidRouteToken(token: string): boolean {
    if (!token) return false
    if (token === 'DCT' || token === 'IFR' || token === 'VFR' || token === 'C' || token === 'NIL') return false
    if (/^N\d{4}$/i.test(token)) return false
    if (/^M\d{3}$/i.test(token)) return false
    if (/^F\d{3,4}$/i.test(token)) return false
    if (/^\d{2,4}$/.test(token)) return false
    if (/^[A-Z]{4}\d{4}$/.test(token)) return false
    if (this.isAirwayToken(token)) return false
    if (/^EQPT$/i.test(token)) return false
    if (/^PBN$/i.test(token)) return false
    if (/^EET$/i.test(token)) return false
    if (/^EQPT\/.+/i.test(token)) return false
    if (/^PBN\/.+/i.test(token)) return false
    if (/^EET\/.+/i.test(token)) return false
    if (/^STS\/.+/i.test(token)) return false
    if (/^RMK\/.+/i.test(token)) return false
    return true
  }

  private cleanupRouteTokens(tokens: string[]): string[] {
    const result: string[] = []

    for (const raw of tokens) {
      const token = String(raw ?? '').trim().toUpperCase()
      if (!token) continue

      if (token.includes('/')) {
        const left = token.split('/', 1)[0]
        if (this.isValidRouteToken(left)) {
          result.push(left)
        }
        continue
      }

      if (this.isValidRouteToken(token)) {
        result.push(token)
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
}