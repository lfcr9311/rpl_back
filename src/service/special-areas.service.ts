import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common'
import { LatLon, SpecialAreaModel, SpecialAreaType } from '../models/notams/special-areas.model'


interface AreaSource {
  type: SpecialAreaType
  typeLabel: string
  source: string
  url: string
}

@Injectable()
export class SpecialAreasService {
  private readonly logger = new Logger(SpecialAreasService.name)

  private readonly sources: AreaSource[] = [
    {
      type: 'D',
      typeLabel: 'Perigosa',
      source: 'eac_d',
      url:
        process.env.EAC_D_WFS_URL ||
        'https://geoaisweb.decea.mil.br/geoserver/ICA/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=ICA%3Aeac_d',
    },
    {
      type: 'P',
      typeLabel: 'Proibida',
      source: 'eac_p',
      url:
        process.env.EAC_P_WFS_URL ||
        'https://geoaisweb.decea.mil.br/geoserver/ICA/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=ICA%3Aeac_p',
    },
    {
      type: 'R',
      typeLabel: 'Restrita',
      source: 'eac_r',
      url:
        process.env.EAC_R_WFS_URL ||
        'https://geoaisweb.decea.mil.br/geoserver/ICA/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=ICA%3Aeac_r',
    },
  ]

  async findAll(): Promise<SpecialAreaModel[]> {
    const results = await Promise.all(
      this.sources.map(async (source) => {
        const xml = await this.fetchText(source.url)
        return this.parseWfsXml(xml, source)
      }),
    )

    const areas = results.flat()

    this.logger.log(`Áreas especiais carregadas: ${areas.length}`)

    return areas
  }

  async findByType(type: SpecialAreaType): Promise<SpecialAreaModel[]> {
    const source = this.sources.find((item) => item.type === type)

    if (!source) {
      return []
    }

    const xml = await this.fetchText(source.url)
    const areas = this.parseWfsXml(xml, source)

    this.logger.log(`Áreas ${source.typeLabel} carregadas: ${areas.length}`)

    return areas
  }

  private async fetchText(url: string): Promise<string> {
    try {
      const response = await fetch(url)

      if (!response.ok) {
        throw new InternalServerErrorException(
          `Falha ao baixar XML de áreas especiais. HTTP ${response.status}`,
        )
      }

      return await response.text()
    } catch (error) {
      this.logger.error('Erro ao baixar XML de áreas especiais', error as Error)
      throw new InternalServerErrorException(
        'Erro ao baixar XML de áreas especiais',
      )
    }
  }

  private parseWfsXml(xml: string, source: AreaSource): SpecialAreaModel[] {
    const content = String(xml ?? '')
    const blocks = this.extractFeatureBlocks(content, source.source)
    const result: SpecialAreaModel[] = []

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i]

      const fid = this.extractAttribute(block, 'fid')
      const gid = this.extractFirstExistingTag(block, [
        `ICA:gid`,
        `ICA:${source.source}_pk`,
        `ICA:${source.source}_id`,
        `ICA:id`,
      ])

      const ident = this.extractFirstExistingTag(block, [
        'ICA:ident',
        'ICA:codeid',
        'ICA:txtdesig',
        'ICA:desig',
        'ICA:name',
      ])

      const name = this.extractFirstExistingTag(block, [
        'ICA:nam',
        'ICA:txtname',
        'ICA:name',
        'ICA:descr',
        'ICA:txtdescr',
      ])

      const effectived = this.extractFirstExistingTag(block, [
        'ICA:effectived',
        'ICA:effective',
      ])

      const upperLimit = this.extractFirstExistingTag(block, [
        'ICA:upperlimit',
        'ICA:uplimit',
        'ICA:valupper',
        'ICA:upper_lim',
      ])

      const lowerLimit = this.extractFirstExistingTag(block, [
        'ICA:lowerlimit',
        'ICA:lowerlimi1',
        'ICA:lowlimit',
        'ICA:vallower',
        'ICA:lower_lim',
      ])

      const upperUnit = this.extractFirstExistingTag(block, [
        'ICA:uplimituni',
        'ICA:uomdistver',
        'ICA:upperunit',
      ])

      const lowerUnit = this.extractFirstExistingTag(block, [
        'ICA:lowerunit',
        'ICA:lowerlimitunit',
        'ICA:codedistv1',
      ])

      const geomBlock = this.extractFirstExistingBlock(block, [
        'ICA:geom',
        'ICA:geometry',
        'ICA:the_geom',
      ])

      const coords = this.extractGmlCoordinatesFromGeom(geomBlock || block)

      if (coords.length < 3) {
        continue
      }

      result.push({
        id: fid || gid || `${source.source}_${i + 1}`,
        source: source.source,
        type: source.type,
        typeLabel: source.typeLabel,
        ident: ident || `${source.type}${i + 1}`,
        name: name || ident || `${source.typeLabel} ${i + 1}`,
        upperLimit,
        lowerLimit,
        upperUnit,
        lowerUnit,
        effectived,
        coords_latlon: coords,
      })
    }

    return result
  }

  private extractFeatureBlocks(xml: string, sourceName: string): string[] {
    const escapedSource = this.escapeRegex(sourceName)
    const regex = new RegExp(
      `<ICA:${escapedSource}\\b[^>]*>[\\s\\S]*?<\\/ICA:${escapedSource}>`,
      'gi',
    )

    const direct = xml.match(regex) ?? []

    if (direct.length > 0) {
      return direct
    }

    const members = this.extractBlocks(xml, 'gml:featureMember')

    return members.filter((member) =>
      new RegExp(`<ICA:${escapedSource}\\b`, 'i').test(member),
    )
  }

  private extractGmlCoordinatesFromGeom(geomBlock: string): LatLon[] {
    const coordinatesBlocks = this.extractBlocks(geomBlock, 'gml:coordinates')

    if (coordinatesBlocks.length > 0) {
      const longestCoordinates = coordinatesBlocks
        .map((block) => this.extractTagText(block, 'gml:coordinates'))
        .sort((a, b) => b.length - a.length)[0]

      return this.parseGmlCoordinates(longestCoordinates)
    }

    const posListBlocks = this.extractBlocks(geomBlock, 'gml:posList')

    if (posListBlocks.length > 0) {
      const longestPosList = posListBlocks
        .map((block) => this.extractTagText(block, 'gml:posList'))
        .sort((a, b) => b.length - a.length)[0]

      return this.parseGmlPosList(longestPosList)
    }

    return []
  }

  private parseGmlCoordinates(value: string): LatLon[] {
    const text = String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim()

    if (!text) {
      return []
    }

    const coords: LatLon[] = []

    for (const pair of text.split(' ')) {
      const parts = pair.split(',')

      if (parts.length < 2) {
        continue
      }

      const lon = Number(parts[0])
      const lat = Number(parts[1])

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        continue
      }

      if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        continue
      }

      coords.push([lat, lon])
    }

    return this.closeRing(coords)
  }

  private parseGmlPosList(value: string): LatLon[] {
    const numbers = String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .map(Number)
      .filter((item) => Number.isFinite(item))

    const coords: LatLon[] = []

    for (let i = 0; i < numbers.length - 1; i += 2) {
      const lon = numbers[i]
      const lat = numbers[i + 1]

      if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        continue
      }

      coords.push([lat, lon])
    }

    return this.closeRing(coords)
  }

  private extractBlocks(xml: string, tagName: string): string[] {
    const escapedTag = this.escapeRegex(tagName)
    const regex = new RegExp(
      `<${escapedTag}\\b[^>]*>[\\s\\S]*?<\\/${escapedTag}>`,
      'gi',
    )

    return xml.match(regex) ?? []
  }

  private extractFirstExistingBlock(xml: string, tagNames: string[]): string {
    for (const tagName of tagNames) {
      const blocks = this.extractBlocks(xml, tagName)

      if (blocks.length > 0) {
        return blocks[0]
      }
    }

    return ''
  }

  private extractFirstExistingTag(xml: string, tagNames: string[]): string {
    for (const tagName of tagNames) {
      const value = this.extractTagText(xml, tagName)

      if (value) {
        return value
      }
    }

    return ''
  }

  private extractTagText(xml: string, tagName: string): string {
    const escapedTag = this.escapeRegex(tagName)
    const regex = new RegExp(
      `<${escapedTag}\\b[^>]*>([\\s\\S]*?)<\\/${escapedTag}>`,
      'i',
    )

    const match = xml.match(regex)

    if (!match) {
      return ''
    }

    return this.decodeXml(match[1].trim())
  }

  private extractAttribute(xml: string, attributeName: string): string {
    const escapedAttribute = this.escapeRegex(attributeName)
    const regex = new RegExp(`${escapedAttribute}="([^"]*)"`, 'i')
    const match = xml.match(regex)

    if (!match) {
      return ''
    }

    return this.decodeXml(match[1].trim())
  }

  private closeRing(coords: LatLon[]): LatLon[] {
    if (coords.length < 3) {
      return coords
    }

    const normalized = [...coords]
    const first = normalized[0]
    const last = normalized[normalized.length - 1]

    if (first[0] !== last[0] || first[1] !== last[1]) {
      normalized.push(first)
    }

    return normalized
  }

  private decodeXml(value: string): string {
    return String(value ?? '')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .trim()
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
}