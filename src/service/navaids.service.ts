import { Injectable, Logger } from '@nestjs/common'
import { XMLParser } from 'fast-xml-parser'
import { NavaidModel, NavaidType } from '../models/notams/navaid.model'

@Injectable()
export class NavaidsService {
  private readonly logger = new Logger(NavaidsService.name)

  private readonly vorUrl =
    process.env.VOR_WFS_URL ||
    'https://geoaisweb.decea.mil.br/geoserver/ICA/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=ICA%3Avor'

  private readonly ndbUrl =
    process.env.NDB_WFS_URL ||
    'https://geoaisweb.decea.mil.br/geoserver/ICA/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=ICA%3Andb'

  private readonly parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    trimValues: true,
    parseTagValue: false,
    removeNSPrefix: true,
  })

  async findAll(): Promise<NavaidModel[]> {
    const [vors, ndbs] = await Promise.all([
      this.findByType('VOR', this.vorUrl),
      this.findByType('NDB', this.ndbUrl),
    ])

    const result = [...vors, ...ndbs].sort((a, b) => {
      const typeCompare = a.type.localeCompare(b.type)
      if (typeCompare !== 0) return typeCompare
      return a.ident.localeCompare(b.ident)
    })

    this.logger.log(`Navaids carregados: ${result.length}`)

    return result
  }

  async findAsGeoJson() {
    const navaids = await this.findAll()

    return {
      type: 'FeatureCollection',
      features: navaids.map((navaid) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [navaid.longitude, navaid.latitude],
        },
        properties: {
          ident: navaid.ident,
          type: navaid.type,
          name: navaid.name ?? '',
          frequency: navaid.frequency ?? '',
        },
      })),
    }
  }

  private async findByType(baseType: 'VOR' | 'NDB', url: string): Promise<NavaidModel[]> {
    const xml = await this.fetchText(url)
    const parsed = this.parser.parse(xml)
    const result = new Map<string, NavaidModel>()

    this.walk(parsed, (node) => {
      const ident = this.pick(node, [
        'codeid',
        'CODEID',
        'ident',
        'IDENT',
        'codigo',
        'CODIGO',
        'designador',
        'DESIGNADOR',
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

      const name = this.pick(node, [
        'txtname',
        'TXTNAME',
        'nome',
        'NOME',
        'name',
        'NAME',
        'descricao',
        'DESCRICAO',
      ])

      const frequencyValue = this.pick(node, [
        'valfreq',
        'VALFREQ',
        'frequencia',
        'FREQUENCIA',
        'frequency',
        'FREQUENCY',
        'freq',
        'FREQ',
      ])

      const frequencyUnit = this.pick(node, [
        'uomfreq',
        'UOMFREQ',
        'unitfreq',
        'UNITFREQ',
      ])

      const rawType = this.pick(node, [
        'type',
        'TYPE',
        'tipo',
        'TIPO',
        'class',
        'CLASS',
        'txttype',
        'TXTTYPE',
      ])

      const rawText = JSON.stringify(node).toUpperCase()

      if (!ident || lat === undefined || lon === undefined) return

      const frequency = this.formatFrequency(frequencyValue, frequencyUnit)
      const type = this.inferType(baseType, String(rawType ?? ''), rawText)

      const item: NavaidModel = {
        ident: String(ident).trim().toUpperCase(),
        latitude: this.parseNumber(lat),
        longitude: this.parseNumber(lon),
        type,
        name: name ? String(name).trim() : undefined,
        frequency,
      }

      if (!item.ident) return
      if (!Number.isFinite(item.latitude)) return
      if (!Number.isFinite(item.longitude)) return
      if (Math.abs(item.latitude) > 90) return
      if (Math.abs(item.longitude) > 180) return

      result.set(`${item.type}-${item.ident}`, item)
    })

    const list = Array.from(result.values())

    this.logger.log(`${baseType}s carregados: ${list.length}`)

    return list
  }

  private inferType(baseType: 'VOR' | 'NDB', rawType: string, rawText: string): NavaidType {
    if (baseType === 'NDB') return 'NDB'

    const text = `${rawType} ${rawText}`.toUpperCase()
    const hasDvor = text.includes('DVOR')
    const hasDme = text.includes('DME')

    if (hasDvor && hasDme) return 'DVOR_DME'
    if (hasDvor) return 'DVOR'
    if (hasDme) return 'VOR_DME'

    return 'VOR'
  }

  private formatFrequency(value: unknown, unit: unknown): string | undefined {
    if (value === undefined || value === null || String(value).trim() === '') {
      return undefined
    }

    const freq = String(value).trim()
    const uom = unit ? String(unit).trim().toUpperCase() : ''

    return uom ? `${freq} ${uom}` : freq
  }

  private async fetchText(url: string): Promise<string> {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/xml,text/xml,*/*',
        'User-Agent': 'Mozilla/5.0 Navaids Client',
      },
    })

    if (!res.ok) {
      throw new Error(`Erro ao buscar ${url}: ${res.status}`)
    }

    return res.text()
  }

  private walk(value: unknown, callback: (node: Record<string, unknown>) => void) {
    if (!value || typeof value !== 'object') return

    if (Array.isArray(value)) {
      for (const item of value) this.walk(item, callback)
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

  private parseNumber(value: unknown): number {
    if (typeof value === 'number') return value

    const text = String(value ?? '').replace(',', '.').trim()
    const num = Number(text)

    return Number.isFinite(num) ? num : NaN
  }
}