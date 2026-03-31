export type NotamProps = {
  id: string
  number: string
  qcode?: string | null
  status?: string | null
  category?: string | null
  dist?: string | null
  type?: string | null
  issuedAt?: Date | null
  location?: string | null
  fir?: string | null
  validFromRaw?: string | null
  validToRaw?: string | null
  validFrom?: Date | null
  validTo?: Date | null
  dailyWindowsRaw?: string | null
  textE?: string | null
  lowerLimit?: string | null
  upperLimit?: string | null
  geo?: string | null
  geoUrl?: string | null
  traffic?: string | null
  purpose?: string | null
  scope?: string | null
  rawPayload?: string | null
}

export class NotamModel {
  id: string
  number: string
  qcode?: string | null
  status?: string | null
  category?: string | null
  dist?: string | null
  type?: string | null
  issuedAt?: Date | null
  location?: string | null
  fir?: string | null
  validFromRaw?: string | null
  validToRaw?: string | null
  validFrom?: Date | null
  validTo?: Date | null
  dailyWindowsRaw?: string | null
  textE?: string | null
  lowerLimit?: string | null
  upperLimit?: string | null
  geo?: string | null
  geoUrl?: string | null
  traffic?: string | null
  purpose?: string | null
  scope?: string | null
  rawPayload?: string | null

  constructor(props: NotamProps) {
    this.id = props.id
    this.number = props.number
    this.qcode = props.qcode ?? null
    this.status = props.status ?? null
    this.category = props.category ?? null
    this.dist = props.dist ?? null
    this.type = props.type ?? null
    this.issuedAt = props.issuedAt ?? null
    this.location = props.location ?? null
    this.fir = props.fir ?? null
    this.validFromRaw = props.validFromRaw ?? null
    this.validToRaw = props.validToRaw ?? null
    this.validFrom = props.validFrom ?? null
    this.validTo = props.validTo ?? null
    this.dailyWindowsRaw = props.dailyWindowsRaw ?? null
    this.textE = props.textE ?? null
    this.lowerLimit = props.lowerLimit ?? null
    this.upperLimit = props.upperLimit ?? null
    this.geo = props.geo ?? null
    this.geoUrl = props.geoUrl ?? null
    this.traffic = props.traffic ?? null
    this.purpose = props.purpose ?? null
    this.scope = props.scope ?? null
    this.rawPayload = props.rawPayload ?? null
  }
}