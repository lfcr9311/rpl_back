import { Injectable } from '@nestjs/common'
import { NotamsService } from './notam.service'

type Coord = [number, number]

type TipoImpacto = 'NENHUM' | 'TEMPORARIA' | 'PERMANENTE' | 'AMBAS'

type AirportItem = {
  icao: string
  latitude: number
  longitude: number
}

type WaypointItem = {
  ident: string
  latitude: number
  longitude: number
}

type AeroviaItem = {
  nome: string
  coords_latlon: Coord[]
}

export type RotaManualResult = {
  ident: string
  tipo_anv: string
  nivel_voo: string
  origem: string
  destino: string
  eobt: string
  eet: string
  eta: string
  rota_texto: string
  linha_original: string
  coords_latlon: Coord[]
  distancia_nm: number
  impactos_temporarias: unknown[]
  impactos_fixas: unknown[]
  impactada: boolean
  impactada_fixa: boolean
  impactada_temporaria: boolean
  tipo_impacto: TipoImpacto
}

type GraphNode = {
  key: string
  ident: string
  latitude: number
  longitude: number
}

@Injectable()
export class ManualRouteService {
  constructor(private readonly notamsService: NotamsService) {}

  async create(origem: string, destino: string): Promise<RotaManualResult> {
    const origemNorm = this.normalizeIdent(origem)
    const destinoNorm = this.normalizeIdent(destino)

    if (!origemNorm || !destinoNorm) {
      throw new Error('origem e destino são obrigatórios')
    }

    const [aeroportosRaw, waypointsRaw, aeroviasAltaRaw, aeroviasBaixaRaw] =
      await Promise.all([
        this.notamsService.importAeroportos(),
        this.notamsService.importWaypoints(),
        this.notamsService.importAeroviasAlta(),
        this.notamsService.importAeroviasBaixa(),
      ])

    const aeroportos = this.normalizeAeroportos(aeroportosRaw)
    const waypoints = this.normalizeWaypoints(waypointsRaw)
    const aeroviasAlta = this.normalizeAerovias(aeroviasAltaRaw)
    const aeroviasBaixa = this.normalizeAerovias(aeroviasBaixaRaw)

    const airportMap = new Map(
      aeroportos.map((a) => [this.normalizeIdent(a.icao), a]),
    )

    const origemAirport = airportMap.get(origemNorm)
    const destinoAirport = airportMap.get(destinoNorm)

    if (!origemAirport) {
      throw new Error(`Aeroporto de origem não encontrado: ${origemNorm}`)
    }

    if (!destinoAirport) {
      throw new Error(`Aeroporto de destino não encontrado: ${destinoNorm}`)
    }

    const graph = this.buildGraph(
      aeroportos,
      waypoints,
      [...aeroviasAlta, ...aeroviasBaixa],
    )

    const origemNode = this.findNearestGraphNode(
      [origemAirport.latitude, origemAirport.longitude],
      graph.nodes,
    )

    const destinoNode = this.findNearestGraphNode(
      [destinoAirport.latitude, destinoAirport.longitude],
      graph.nodes,
    )

    let coords: Coord[] = [
      [origemAirport.latitude, origemAirport.longitude],
      [destinoAirport.latitude, destinoAirport.longitude],
    ]

    let rotaTexto = `${origemNorm} ${destinoNorm}`

    if (origemNode && destinoNode) {
      const pathKeys = this.shortestPath(
        graph.adj,
        origemNode.key,
        destinoNode.key,
      )

      if (pathKeys.length >= 2) {
        const pathNodes = pathKeys
          .map((key) => graph.nodeMap.get(key))
          .filter((node): node is GraphNode => Boolean(node))

        const pathCoords = pathNodes.map(
          (node) => [node.latitude, node.longitude] as Coord,
        )

        coords = this.compactCoords([
          [origemAirport.latitude, origemAirport.longitude],
          ...pathCoords,
          [destinoAirport.latitude, destinoAirport.longitude],
        ])

        rotaTexto = [
          origemNorm,
          ...pathNodes.map((node) => node.ident),
          destinoNorm,
        ].join(' ')
      }
    }

    const distanciaNm = this.calcularDistanciaNM(
      [origemAirport.latitude, origemAirport.longitude],
      [destinoAirport.latitude, destinoAirport.longitude],
    )

    return {
      ident: `MANUAL-${origemNorm}-${destinoNorm}`,
      tipo_anv: 'MANUAL',
      nivel_voo: '',
      origem: origemNorm,
      destino: destinoNorm,
      eobt: '',
      eet: '',
      eta: '',
      rota_texto: rotaTexto,
      linha_original: rotaTexto,
      coords_latlon: coords,
      distancia_nm: Number(distanciaNm.toFixed(2)),
      impactos_temporarias: [],
      impactos_fixas: [],
      impactada: false,
      impactada_fixa: false,
      impactada_temporaria: false,
      tipo_impacto: 'NENHUM',
    }
  }

  private normalizeAeroportos(items: unknown[]): AirportItem[] {
    if (!Array.isArray(items)) return []

    return items
      .map((item) => {
        const value = item as Record<string, unknown>

        const icao = this.normalizeIdent(value.icao)
        const latitude = Number(value.latitude)
        const longitude = Number(value.longitude)

        if (!icao || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          return null
        }

        return {
          icao,
          latitude,
          longitude,
        } satisfies AirportItem
      })
      .filter((item): item is AirportItem => Boolean(item))
  }

  private toRad(deg: number): number {
    return (deg * Math.PI) / 180
  }

  private calcularDistanciaNM(origem: Coord, destino: Coord): number {
    const [lat1, lon1] = origem
    const [lat2, lon2] = destino

    const R = 3440.065

    const dLat = this.toRad(lat2 - lat1)
    const dLon = this.toRad(lon2 - lon1)

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2)

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

    return R * c
  }

  private normalizeWaypoints(items: unknown[]): WaypointItem[] {
    if (!Array.isArray(items)) return []

    return items
      .map((item) => {
        const value = item as Record<string, unknown>

        const ident = this.normalizeIdent(value.ident)
        const latitude = Number(value.latitude)
        const longitude = Number(value.longitude)

        if (!ident || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          return null
        }

        return {
          ident,
          latitude,
          longitude,
        } satisfies WaypointItem
      })
      .filter((item): item is WaypointItem => Boolean(item))
  }

  private normalizeAerovias(items: unknown[]): AeroviaItem[] {
    if (!Array.isArray(items)) return []

    return items
      .map((item) => {
        const value = item as Record<string, unknown>
        const nome = String(value.nome ?? '').trim()

        const coords_latlon = Array.isArray(value.coords_latlon)
          ? value.coords_latlon
              .map((point) => {
                if (!Array.isArray(point) || point.length < 2) return null

                const lat = Number(point[0])
                const lon = Number(point[1])

                if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
                if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null

                return [lat, lon] as Coord
              })
              .filter((point): point is Coord => Boolean(point))
          : []

        if (!nome || coords_latlon.length < 2) {
          return null
        }

        return {
          nome,
          coords_latlon,
        } satisfies AeroviaItem
      })
      .filter((item): item is AeroviaItem => Boolean(item))
  }

  private buildGraph(
    aeroportos: AirportItem[],
    waypoints: WaypointItem[],
    aerovias: AeroviaItem[],
  ) {
    const nodeMap = new Map<string, GraphNode>()
    const adj = new Map<string, Array<{ to: string; weight: number }>>()

    const addNode = (ident: string, latitude: number, longitude: number) => {
      const lat = Number(latitude)
      const lon = Number(longitude)
      const key = `${this.normalizeIdent(ident)}|${lat.toFixed(6)}|${lon.toFixed(6)}`

      if (!nodeMap.has(key)) {
        nodeMap.set(key, {
          key,
          ident: this.normalizeIdent(ident),
          latitude: lat,
          longitude: lon,
        })
      }

      if (!adj.has(key)) {
        adj.set(key, [])
      }

      return nodeMap.get(key)!
    }

    const addEdge = (aKey: string, bKey: string, weight: number) => {
      if (!adj.has(aKey)) adj.set(aKey, [])
      if (!adj.has(bKey)) adj.set(bKey, [])

      adj.get(aKey)!.push({ to: bKey, weight })
      adj.get(bKey)!.push({ to: aKey, weight })
    }

    for (const aeroporto of aeroportos) {
      addNode(aeroporto.icao, aeroporto.latitude, aeroporto.longitude)
    }

    for (const waypoint of waypoints) {
      addNode(waypoint.ident, waypoint.latitude, waypoint.longitude)
    }

    for (const aerovia of aerovias) {
      const coords = aerovia.coords_latlon
      if (coords.length < 2) continue

      const nodes: GraphNode[] = []

      for (let i = 0; i < coords.length; i++) {
        const [lat, lon] = coords[i]
        const node = addNode(`${aerovia.nome}_${i}`, lat, lon)
        nodes.push(node)
      }

      for (let i = 0; i < nodes.length - 1; i++) {
        const a = nodes[i]
        const b = nodes[i + 1]

        addEdge(
          a.key,
          b.key,
          this.distanceNm([a.latitude, a.longitude], [b.latitude, b.longitude]),
        )
      }
    }

    return {
      nodes: Array.from(nodeMap.values()),
      nodeMap,
      adj,
    }
  }

  private findNearestGraphNode(point: Coord, nodes: GraphNode[]): GraphNode | null {
    let best: GraphNode | null = null
    let bestDistance = Number.POSITIVE_INFINITY

    for (const node of nodes) {
      const d = this.distanceNm(point, [node.latitude, node.longitude])
      if (d < bestDistance) {
        bestDistance = d
        best = node
      }
    }

    return best
  }

  private shortestPath(
    adj: Map<string, Array<{ to: string; weight: number }>>,
    start: string,
    end: string,
  ): string[] {
    const dist = new Map<string, number>()
    const prev = new Map<string, string | null>()
    const visited = new Set<string>()

    for (const key of adj.keys()) {
      dist.set(key, Number.POSITIVE_INFINITY)
      prev.set(key, null)
    }

    dist.set(start, 0)

    while (visited.size < adj.size) {
      let current: string | null = null
      let currentDist = Number.POSITIVE_INFINITY

      for (const [key, value] of dist.entries()) {
        if (!visited.has(key) && value < currentDist) {
          current = key
          currentDist = value
        }
      }

      if (!current) break
      if (current === end) break

      visited.add(current)

      const neighbors = adj.get(current) ?? []
      for (const neighbor of neighbors) {
        if (visited.has(neighbor.to)) continue

        const alt = currentDist + neighbor.weight
        if (alt < (dist.get(neighbor.to) ?? Number.POSITIVE_INFINITY)) {
          dist.set(neighbor.to, alt)
          prev.set(neighbor.to, current)
        }
      }
    }

    const path: string[] = []
    let current: string | null = end

    while (current) {
      path.unshift(current)
      current = prev.get(current) ?? null
    }

    if (path.length === 0 || path[0] !== start) {
      return []
    }

    return path
  }

  private compactCoords(coords: Coord[]): Coord[] {
    const result: Coord[] = []

    for (const coord of coords) {
      const last = result[result.length - 1]
      if (!last || last[0] !== coord[0] || last[1] !== coord[1]) {
        result.push(coord)
      }
    }

    return result
  }

  private distanceNm(a: Coord, b: Coord): number {
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
    const meters = R * c

    return meters / 1852
  }

  private normalizeIdent(value: unknown): string {
    return String(value ?? '').trim().toUpperCase()
  }
}