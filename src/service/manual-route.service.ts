import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { XMLParser } from 'fast-xml-parser'
import {
  GeoJsonFeatureCollectionModel,
  GeoJsonFeatureModel,
  GeoJsonGeometryModel,
  LatLon,
  ManualRouteAirportModel,
  ManualRouteAirwayModel,
  ManualRoutePointModel,
  ManualRouteRequestModel,
  ManualRouteResponseModel,
  ManualRouteSegmentModel,
  ManualRouteWaypointModel,
} from '../models/notams/manual-route.model'

type NavaidRoutePointModel = {
  ident: string
  latitude: number
  longitude: number
  type: 'VOR' | 'NDB'
}

@Injectable()
export class ManualRouteService {
  private readonly logger = new Logger(ManualRouteService.name)

  private readonly aeroviasAltaUrl =
    process.env.AEROVIAS_ALTA_URL ||
    'https://geoaisweb.decea.mil.br/geoserver/ICA/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=ICA:vw_aerovia_alta_v2&outputFormat=application/json&srsName=EPSG:4326'

  private readonly aeroviasBaixaUrl =
    process.env.AEROVIAS_BAIXA_URL ||
    'https://geoaisweb.decea.mil.br/geoserver/ICA/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=ICA:vw_aerovia_baixa_v2&outputFormat=application/json&srsName=EPSG:4326'

  private readonly waypointsUrl =
    process.env.WAYPOINTS_WFS_URL ||
    'https://geoaisweb.decea.mil.br/geoserver/ICA/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=ICA%3Awaypoint'

  private readonly vorUrl =
    process.env.VOR_WFS_URL ||
    'https://geoaisweb.decea.mil.br/geoserver/ICA/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=ICA%3Avor'

  private readonly ndbUrl =
    process.env.NDB_WFS_URL ||
    'https://geoaisweb.decea.mil.br/geoserver/ICA/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=ICA%3Andb'

  private readonly airportsUrl =
    process.env.AIRPORTS_URL ||
    'https://ourairports.com/data/airports.csv'

  private readonly parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    trimValues: true,
    parseTagValue: false,
    removeNSPrefix: true,
  })

  private airportsCache: Map<string, ManualRouteAirportModel> | null = null
  private waypointsCache: Map<string, ManualRouteWaypointModel> | null = null
  private navaidsCache: Map<string, NavaidRoutePointModel> | null = null
  private aeroviasCache: ManualRouteAirwayModel[] | null = null

  async buildRoute(body: ManualRouteRequestModel): Promise<ManualRouteResponseModel> {
    const origem = this.normalizeIdent(body.origem)
    const destino = this.normalizeIdent(body.destino)
    const rota = String(body.rota ?? '').trim().toUpperCase()

    if (!origem) {
      throw new BadRequestException('Origem obrigatória')
    }

    if (!destino) {
      throw new BadRequestException('Destino obrigatório')
    }

    if (!rota) {
      throw new BadRequestException('Rota obrigatória')
    }

    const [airports, waypoints, navaids, aerovias] = await Promise.all([
      this.getAirports(),
      this.getWaypoints(),
      this.getNavaids(),
      this.getAerovias(),
    ])

    const origemPoint = this.resolvePoint(origem, airports, waypoints, navaids)
    const destinoPoint = this.resolvePoint(destino, airports, waypoints, navaids)

    if (!origemPoint) {
      throw new BadRequestException(`Origem não encontrada: ${origem}`)
    }

    if (!destinoPoint) {
      throw new BadRequestException(`Destino não encontrado: ${destino}`)
    }

    const tokens = this.tokenizeRoute(rota)
    const coords: LatLon[] = []
    const segmentos: ManualRouteSegmentModel[] = []
    const pontosResolvidos: string[] = []

    this.pushCoord(coords, [origemPoint.latitude, origemPoint.longitude])
    this.pushIdent(pontosResolvidos, origem)

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]

      if (this.isSkipToken(token)) {
        continue
      }

      if (this.isAirwayToken(token)) {
        const previous = tokens[i - 1]
        const next = tokens[i + 1]

        if (!previous || !next) {
          throw new BadRequestException(`Aerovia sem ponto inicial/final: ${token}`)
        }

        const fromPoint = this.resolvePoint(previous, airports, waypoints, navaids)
        const toPoint = this.resolvePoint(next, airports, waypoints, navaids)

        if (!fromPoint) {
          throw new BadRequestException(`Ponto inicial da aerovia não encontrado: ${previous}`)
        }

        if (!toPoint) {
          throw new BadRequestException(`Ponto final da aerovia não encontrado: ${next}`)
        }

        const segmentCoords = this.resolveAirwaySegment(
          token,
          [fromPoint.latitude, fromPoint.longitude],
          [toPoint.latitude, toPoint.longitude],
          aerovias,
        )

        for (const point of segmentCoords) {
          this.pushCoord(coords, point)
        }

        segmentos.push({
          type: 'AIRWAY',
          airway: token,
          from: previous,
          to: next,
          coords_latlon: segmentCoords,
        })

        this.pushIdent(pontosResolvidos, previous)
        this.pushIdent(pontosResolvidos, token)
        this.pushIdent(pontosResolvidos, next)

        i += 1
        continue
      }

      const previous = tokens[i - 1]
      const next = tokens[i + 1]

      if (this.isAirwayToken(previous) || this.isAirwayToken(next)) {
        const point = this.resolvePoint(token, airports, waypoints, navaids)

        if (!point) {
          throw new BadRequestException(`Ponto não encontrado: ${token}`)
        }

        this.pushIdent(pontosResolvidos, token)
        continue
      }

      const point = this.resolvePoint(token, airports, waypoints, navaids)

      if (!point) {
        throw new BadRequestException(`Ponto não encontrado: ${token}`)
      }

      const coord: LatLon = [point.latitude, point.longitude]
      this.pushCoord(coords, coord)
      this.pushIdent(pontosResolvidos, token)

      segmentos.push({
        type: 'DCT',
        from: token,
        to: token,
        coords_latlon: [coord],
      })
    }

    this.pushCoord(coords, [destinoPoint.latitude, destinoPoint.longitude])
    this.pushIdent(pontosResolvidos, destino)

    if (coords.length < 2) {
      throw new BadRequestException('Rota sem coordenadas suficientes')
    }

    const finalCoords = this.dedupeCoords(coords)

    return {
      origem,
      destino,
      rota,
      coords_latlon: finalCoords,
      pontos_resolvidos: pontosResolvidos,
      segmentos,
      distancia_total_nm: this.round(this.totalDistanceNm(finalCoords), 2),
    }
  }

  private async getAirports(): Promise<Map<string, ManualRouteAirportModel>> {
    if (this.airportsCache) {
      return this.airportsCache
    }

    const csv = await this.fetchText(this.airportsUrl)
    const airports = this.parseAirportsCsv(csv)

    this.airportsCache = airports
    this.logger.log(`Aeroportos carregados: ${airports.size}`)

    return airports
  }

  private async getWaypoints(): Promise<Map<string, ManualRouteWaypointModel>> {
    if (this.waypointsCache) {
      return this.waypointsCache
    }

    const xml = await this.fetchText(this.waypointsUrl)
    const waypoints = this.parseWaypointsXml(xml)

    this.waypointsCache = waypoints
    this.logger.log(`Waypoints carregados: ${waypoints.size}`)

    return waypoints
  }

  private async getNavaids(): Promise<Map<string, NavaidRoutePointModel>> {
    if (this.navaidsCache) {
      return this.navaidsCache
    }

    const [vorXml, ndbXml] = await Promise.all([
      this.fetchText(this.vorUrl),
      this.fetchText(this.ndbUrl),
    ])

    const result = new Map<string, NavaidRoutePointModel>()

    for (const item of this.parseNavaidsXml(vorXml, 'VOR')) {
      result.set(item.ident, item)
    }

    for (const item of this.parseNavaidsXml(ndbXml, 'NDB')) {
      result.set(item.ident, item)
    }

    this.navaidsCache = result
    this.logger.log(`Navaids carregados para rota manual: ${result.size}`)

    return result
  }

  private async getAerovias(): Promise<ManualRouteAirwayModel[]> {
    if (this.aeroviasCache) {
      return this.aeroviasCache
    }

    const [alta, baixa] = await Promise.all([
      this.fetchJson<GeoJsonFeatureCollectionModel>(this.aeroviasAltaUrl),
      this.fetchJson<GeoJsonFeatureCollectionModel>(this.aeroviasBaixaUrl),
    ])

    const aerovias = [
      ...this.parseAeroviasGeoJson(alta),
      ...this.parseAeroviasGeoJson(baixa),
    ]

    this.aeroviasCache = aerovias
    this.logger.log(`Aerovias carregadas: ${aerovias.length}`)

    return aerovias
  }

  private resolveAirwaySegment(
    airwayName: string,
    from: LatLon,
    to: LatLon,
    aerovias: ManualRouteAirwayModel[],
  ): LatLon[] {
    const candidates = aerovias.filter(
      (aerovia) => this.normalizeIdent(aerovia.nome) === airwayName,
    )

    if (!candidates.length) {
      throw new BadRequestException(`Aerovia não encontrada: ${airwayName}`)
    }

    let bestSegment: LatLon[] = []
    let bestScore = Number.POSITIVE_INFINITY

    for (const aerovia of candidates) {
      if (aerovia.coords_latlon.length < 2) continue

      const fromIndex = this.findNearestIndex(aerovia.coords_latlon, from)
      const toIndex = this.findNearestIndex(aerovia.coords_latlon, to)

      if (fromIndex < 0 || toIndex < 0) continue

      const fromDistance = this.distanceMeters(aerovia.coords_latlon[fromIndex], from)
      const toDistance = this.distanceMeters(aerovia.coords_latlon[toIndex], to)
      const score = fromDistance + toDistance

      const segment = this.sliceLine(aerovia.coords_latlon, fromIndex, toIndex)

      if (segment.length >= 2 && score < bestScore) {
        bestScore = score
        bestSegment = segment
      }
    }

    if (bestSegment.length < 2) {
      throw new BadRequestException(`Não foi possível recortar a aerovia ${airwayName}`)
    }

    return this.dedupeCoords([from, ...bestSegment, to])
  }

  private resolvePoint(
    ident: string,
    airports: Map<string, ManualRouteAirportModel>,
    waypoints: Map<string, ManualRouteWaypointModel>,
    navaids: Map<string, NavaidRoutePointModel>,
  ): ManualRoutePointModel | null {
    const key = this.normalizeIdent(ident)

    const airport = airports.get(key)
    if (airport) {
      return {
        ident: airport.ident,
        latitude: airport.latitude,
        longitude: airport.longitude,
        type: 'AIRPORT',
      }
    }

    const waypoint = waypoints.get(key)
    if (waypoint) {
      return {
        ident: waypoint.ident,
        latitude: waypoint.latitude,
        longitude: waypoint.longitude,
        type: 'WAYPOINT',
      }
    }

    const navaid = navaids.get(key)
    if (navaid) {
      return {
        ident: navaid.ident,
        latitude: navaid.latitude,
        longitude: navaid.longitude,
        type: 'WAYPOINT',
      }
    }

    return null
  }

  private parseAeroviasGeoJson(payload: GeoJsonFeatureCollectionModel): ManualRouteAirwayModel[] {
    const features = Array.isArray(payload?.features) ? payload.features : []
    const result: ManualRouteAirwayModel[] = []

    for (const feature of features) {
      const nome = this.extractAirwayName(feature)
      const lines = this.geometryToLines(feature.geometry)

      if (!nome) continue

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

  private extractAirwayName(feature: GeoJsonFeatureModel): string {
    const properties = feature.properties ?? {}

    const candidates = [
      properties.text_designator,
      properties.designator,
      properties.nome,
      properties.name,
      properties.ident,
      properties.txtident,
      properties.rota,
      properties.id,
    ]

    for (const value of candidates) {
      const text = this.normalizeIdent(String(value ?? ''))
      if (text) return text
    }

    return ''
  }

  private geometryToLines(geometry?: GeoJsonGeometryModel | null): LatLon[][] {
    if (!geometry) return []

    if (geometry.type === 'LineString') {
      return [
        geometry.coordinates
          .map((point) => this.toLatLon(point))
          .filter((point): point is LatLon => !!point),
      ]
    }

    if (geometry.type === 'MultiLineString') {
      return geometry.coordinates.map((line) =>
        line
          .map((point) => this.toLatLon(point))
          .filter((point): point is LatLon => !!point),
      )
    }

    return []
  }

  private toLatLon(point: number[]): LatLon | null {
    if (!Array.isArray(point) || point.length < 2) {
      return null
    }

    const lon = Number(point[0])
    const lat = Number(point[1])

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return null
    }

    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      return null
    }

    return [lat, lon]
  }

  private parseWaypointsXml(xml: string): Map<string, ManualRouteWaypointModel> {
    const parsed = this.parser.parse(xml)
    const result = new Map<string, ManualRouteWaypointModel>()

    this.walk(parsed, (node) => {
      const ident = this.pick(node, [
        'ident',
        'IDENT',
        'codeid',
        'CODEID',
        'txtdesig',
        'TXTDESIG',
        'name',
        'NAME',
      ])

      const lat = this.pick(node, [
        'geolat',
        'GEOLAT',
        'latitude',
        'LATITUDE',
        'lat',
        'LAT',
      ])

      const lon = this.pick(node, [
        'geolong',
        'GEOLONG',
        'longitude',
        'LONGITUDE',
        'lon',
        'LON',
        'lng',
        'LNG',
      ])

      if (!ident || lat === undefined || lon === undefined) return

      const waypoint: ManualRouteWaypointModel = {
        ident: this.normalizeIdent(String(ident)),
        latitude: this.parseNumber(lat),
        longitude: this.parseNumber(lon),
      }

      if (!waypoint.ident) return
      if (!this.isValidLatLon([waypoint.latitude, waypoint.longitude])) return

      result.set(waypoint.ident, waypoint)
    })

    return result
  }

  private parseNavaidsXml(xml: string, type: 'VOR' | 'NDB'): NavaidRoutePointModel[] {
    const parsed = this.parser.parse(xml)
    const result = new Map<string, NavaidRoutePointModel>()

    this.walk(parsed, (node) => {
      const ident = this.pick(node, [
        'codeid',
        'CODEID',
        'ident',
        'IDENT',
        'txtdesig',
        'TXTDESIG',
        'name',
        'NAME',
      ])

      const lat = this.pick(node, [
        'geolat',
        'GEOLAT',
        'latitude',
        'LATITUDE',
        'lat',
        'LAT',
      ])

      const lon = this.pick(node, [
        'geolong',
        'GEOLONG',
        'longitude',
        'LONGITUDE',
        'lon',
        'LON',
        'lng',
        'LNG',
      ])

      if (!ident || lat === undefined || lon === undefined) return

      const item: NavaidRoutePointModel = {
        ident: this.normalizeIdent(String(ident)),
        latitude: this.parseNumber(lat),
        longitude: this.parseNumber(lon),
        type,
      }

      if (!item.ident) return
      if (!this.isValidLatLon([item.latitude, item.longitude])) return

      result.set(item.ident, item)
    })

    return Array.from(result.values())
  }

  private parseAirportsCsv(csv: string): Map<string, ManualRouteAirportModel> {
    const result = new Map<string, ManualRouteAirportModel>()
    const lines = csv.split(/\r?\n/).filter((line) => line.trim())

    if (lines.length < 2) {
      return result
    }

    const headers = this.splitCsvLine(lines[0])
    const idxGpsCode = headers.indexOf('gps_code')
    const idxIdent = headers.indexOf('ident')
    const idxLocalCode = headers.indexOf('local_code')
    const idxLatitude = headers.indexOf('latitude_deg')
    const idxLongitude = headers.indexOf('longitude_deg')
    const idxType = headers.indexOf('type')

    for (let i = 1; i < lines.length; i++) {
      const cols = this.splitCsvLine(lines[i])

      const gpsCode = this.normalizeIdent(cols[idxGpsCode])
      const ident = this.normalizeIdent(cols[idxIdent])
      const localCode = this.normalizeIdent(cols[idxLocalCode])
      const icao = gpsCode || ident || localCode

      const type = String(cols[idxType] ?? '').trim().toLowerCase()
      const latitude = this.parseNumber(cols[idxLatitude])
      const longitude = this.parseNumber(cols[idxLongitude])

      if (!icao) continue
      if (type === 'closed') continue
      if (!this.isValidLatLon([latitude, longitude])) continue

      result.set(icao, {
        ident: icao,
        latitude,
        longitude,
      })
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

  private tokenizeRoute(route: string): string[] {
    return route
      .toUpperCase()
      .replace(/[,;]/g, ' ')
      .split(/\s+/)
      .map((token) => this.normalizeIdent(token))
      .filter(Boolean)
  }

  private normalizeIdent(value?: string | null): string {
    return String(value ?? '').trim().toUpperCase()
  }

  private isSkipToken(token?: string): boolean {
    const value = this.normalizeIdent(token)
    return value === 'DCT' || value === 'DIRECT'
  }

  private isAirwayToken(token?: string): boolean {
    const value = this.normalizeIdent(token)
    return /^[A-Z]{1,3}\d{1,4}[A-Z]?$/.test(value)
  }

  private findNearestIndex(coords: LatLon[], target: LatLon): number {
    let bestIndex = -1
    let bestDistance = Number.POSITIVE_INFINITY

    for (let i = 0; i < coords.length; i++) {
      const distance = this.distanceMeters(coords[i], target)

      if (distance < bestDistance) {
        bestDistance = distance
        bestIndex = i
      }
    }

    return bestIndex
  }

  private sliceLine(coords: LatLon[], fromIndex: number, toIndex: number): LatLon[] {
    if (fromIndex === toIndex) {
      return [coords[fromIndex]]
    }

    if (fromIndex < toIndex) {
      return coords.slice(fromIndex, toIndex + 1)
    }

    return coords.slice(toIndex, fromIndex + 1).reverse()
  }

  private pushCoord(coords: LatLon[], coord: LatLon) {
    if (!this.isValidLatLon(coord)) return

    const last = coords[coords.length - 1]

    if (last && this.sameCoord(last, coord)) {
      return
    }

    coords.push(coord)
  }

  private pushIdent(items: string[], ident: string) {
    const normalized = this.normalizeIdent(ident)
    if (!normalized) return

    if (items[items.length - 1] === normalized) {
      return
    }

    items.push(normalized)
  }

  private dedupeCoords(coords: LatLon[]): LatLon[] {
    const result: LatLon[] = []
    const seen = new Set<string>()

    for (const coord of coords) {
      if (!this.isValidLatLon(coord)) continue

      const key = `${coord[0].toFixed(6)},${coord[1].toFixed(6)}`
      if (seen.has(key)) continue

      seen.add(key)
      result.push(coord)
    }

    return result
  }

  private sameCoord(a: LatLon, b: LatLon): boolean {
    return Math.abs(a[0] - b[0]) < 0.000001 && Math.abs(a[1] - b[1]) < 0.000001
  }

  private isValidLatLon(coord: LatLon): boolean {
    const [lat, lon] = coord

    return (
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lon) <= 180
    )
  }

  private distanceMeters(a: LatLon, b: LatLon): number {
    const R = 6371000
    const lat1 = (a[0] * Math.PI) / 180
    const lat2 = (b[0] * Math.PI) / 180
    const dLat = ((b[0] - a[0]) * Math.PI) / 180
    const dLon = ((b[1] - a[1]) * Math.PI) / 180

    const x =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) *
        Math.cos(lat2) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2)

    const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
    return R * c
  }

  private totalDistanceNm(coords: LatLon[]): number {
    let totalMeters = 0

    for (let i = 0; i < coords.length - 1; i++) {
      totalMeters += this.distanceMeters(coords[i], coords[i + 1])
    }

    return totalMeters / 1852
  }

  private round(value: number, decimals: number): number {
    const factor = 10 ** decimals
    return Math.round(value * factor) / factor
  }

  private parseNumber(value: unknown): number {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : Number.NaN
    }

    const text = String(value ?? '').trim().replace(',', '.')
    const parsed = Number(text)

    return Number.isFinite(parsed) ? parsed : Number.NaN
  }

  private async fetchText(url: string): Promise<string> {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/xml,text/xml,text/plain,*/*',
        'User-Agent': 'Mozilla/5.0 Manual Route Client',
      },
    })

    if (!response.ok) {
      throw new Error(`Erro HTTP ${response.status} em ${url}`)
    }

    return response.text()
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json,*/*',
        'User-Agent': 'Mozilla/5.0 Manual Route Client',
      },
    })

    if (!response.ok) {
      throw new Error(`Erro HTTP ${response.status} em ${url}`)
    }

    return response.json() as Promise<T>
  }
}