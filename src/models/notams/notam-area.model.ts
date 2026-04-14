export type LatLon = [number, number]

export type AreaNotamApiModel = {
  nome: string
  numero_notam: string
  fir_match: string
  area_type: string
  valid_from: string
  valid_to: string
  q_line: string
  coords_latlon: LatLon[]
  texto_notam: string
  f: string
  g: string
  source_id: string
  geometry_type: 'POLYGON' | 'CIRCLE'
  center: LatLon | null
  radius_m: number | null
  lido: boolean
}