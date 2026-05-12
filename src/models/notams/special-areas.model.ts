export type SpecialAreaType = 'D' | 'P' | 'R'

export type LatLon = [number, number]

export interface SpecialAreaModel {
  id: string
  source: string
  type: SpecialAreaType
  typeLabel: string
  ident: string
  name: string
  upperLimit: string
  lowerLimit: string
  upperUnit: string
  lowerUnit: string
  effectived: string
  coords_latlon: LatLon[]
}