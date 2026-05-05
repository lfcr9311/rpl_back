export type NavaidType =
  | 'VOR'
  | 'DVOR'
  | 'VOR_DME'
  | 'DVOR_DME'
  | 'NDB'

export type NavaidModel = {
  ident: string
  latitude: number
  longitude: number
  type: NavaidType
  name?: string
  frequency?: string
}