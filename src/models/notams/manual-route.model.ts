export type LatLon = [number, number]

export type ManualRouteRequestModel = {
  origem: string
  destino: string
  rota: string
}

export type ManualRoutePointModel = {
  ident: string
  latitude: number
  longitude: number
  type: 'AIRPORT' | 'WAYPOINT'
}

export type ManualRouteSegmentModel = {
  type: 'DCT' | 'AIRWAY'
  from: string
  to: string
  airway?: string
  coords_latlon: LatLon[]
}

export type ManualRouteResponseModel = {
  origem: string
  destino: string
  rota: string
  coords_latlon: LatLon[]
  pontos_resolvidos: string[]
  segmentos: ManualRouteSegmentModel[]
  distancia_total_nm: number
}

export type ManualRouteAirportModel = {
  ident: string
  latitude: number
  longitude: number
}

export type ManualRouteWaypointModel = {
  ident: string
  latitude: number
  longitude: number
}

export type ManualRouteAirwayModel = {
  nome: string
  coords_latlon: LatLon[]
}

export type GeoJsonFeatureCollectionModel = {
  type: string
  features: GeoJsonFeatureModel[]
}

export type GeoJsonFeatureModel = {
  type: string
  properties?: Record<string, unknown>
  geometry?: GeoJsonGeometryModel | null
}

export type GeoJsonGeometryModel =
  | {
      type: 'LineString'
      coordinates: number[][]
    }
  | {
      type: 'MultiLineString'
      coordinates: number[][][]
    }