export type LatLon = [number, number]

export type FirModel = {
  id: string
  ident: string
  nome: string
  icaocode: string
  relatedfir: string
  tipo: string
  coords_latlon: LatLon[]
}