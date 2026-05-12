import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common'
import { FirModel, LatLon } from '../models/notams/fir.model'

@Injectable()
export class FirService {
  private readonly logger = new Logger(FirService.name)

  private readonly firUrl =
    process.env.FIR_WFS_URL ||
    'https://geoaisweb.decea.mil.br/geoserver/ICA/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=ICA%3Afir'

  async findAll(): Promise<FirModel[]> {
    const xml = await this.fetchText(this.firUrl)
    const firs = this.parseFirXml(xml)

    this.logger.log(`FIRs carregadas via WFS XML: ${firs.length}`)

    return firs
  }

  private async fetchText(url: string): Promise<string> {
    try {
      const response = await fetch(url)

      if (!response.ok) {
        throw new InternalServerErrorException(
          `Falha ao baixar XML de FIR. HTTP ${response.status}`,
        )
      }

      return await response.text()
    } catch (error) {
      this.logger.error('Erro ao baixar XML de FIR', error as Error)
      throw new InternalServerErrorException('Erro ao baixar XML de FIR')
    }
  }

  private parseFirXml(xml: string): FirModel[] {
    const content = String(xml ?? '')
    const firBlocks = this.extractBlocks(content, 'ICA:fir')
    const result: FirModel[] = []

    for (let i = 0; i < firBlocks.length; i++) {
      const block = firBlocks[i]

      const fid = this.extractAttribute(block, 'fid')
      const gid = this.extractTagText(block, 'ICA:gid')
      const ident = this.extractTagText(block, 'ICA:ident').toUpperCase()
      const nome = this.extractTagText(block, 'ICA:nam')
      const icaocode = this.extractTagText(block, 'ICA:icaocode').toUpperCase()
      const tipo = this.extractTagText(block, 'ICA:typ')
      const relatedfir = this.extractTagText(block, 'ICA:relatedfir').toUpperCase()
      const geomBlock = this.extractFirstBlock(block, 'ICA:geom')
      const coords = this.extractGmlCoordinatesFromGeom(geomBlock)

      if (!ident || coords.length < 3) {
        continue
      }

      result.push({
        id: fid || gid || ident || `FIR_${i + 1}`,
        ident,
        nome: nome || ident,
        icaocode,
        relatedfir,
        tipo,
        coords_latlon: coords,
      })
    }

    return result
  }

  private extractBlocks(xml: string, tagName: string): string[] {
    const escapedTag = this.escapeRegex(tagName)
    const regex = new RegExp(`<${escapedTag}\\b[^>]*>[\\s\\S]*?<\\/${escapedTag}>`, 'gi')
    return xml.match(regex) ?? []
  }

  private extractFirstBlock(xml: string, tagName: string): string {
    const blocks = this.extractBlocks(xml, tagName)
    return blocks[0] ?? ''
  }

  private extractTagText(xml: string, tagName: string): string {
    const escapedTag = this.escapeRegex(tagName)
    const regex = new RegExp(`<${escapedTag}\\b[^>]*>([\\s\\S]*?)<\\/${escapedTag}>`, 'i')
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

  private extractGmlCoordinatesFromGeom(geomBlock: string): LatLon[] {
    if (!geomBlock) {
      return []
    }

    const coordinatesBlocks = this.extractBlocks(geomBlock, 'gml:coordinates')
    const longestCoordinates = coordinatesBlocks
      .map((block) => this.extractTagText(block, 'gml:coordinates'))
      .sort((a, b) => b.length - a.length)[0]

    if (!longestCoordinates) {
      return []
    }

    return this.parseGmlCoordinates(longestCoordinates)
  }

  private parseGmlCoordinates(value: string): LatLon[] {
    const text = String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim()

    if (!text) {
      return []
    }

    const coords: LatLon[] = []
    const pairs = text.split(' ')

    for (const pair of pairs) {
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