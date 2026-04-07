import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class EnvService {
  constructor(private readonly configService: ConfigService) {}

  get aiswebApiUrl(): string {
    return this.configService.getOrThrow<string>('AISWEB_API_URL')
  }

  get aiswebApiKey(): string {
    return this.configService.getOrThrow<string>('AISWEB_API_KEY')
  }

  get aiswebApiPass(): string {
    return this.configService.getOrThrow<string>('AISWEB_API_PASS')
  }

  get aiswebArea(): string {
    return this.configService.get<string>('AISWEB_AREA', 'notam')
  }

  get aiswebDist(): string {
    return this.configService.get<string>('AISWEB_DIST', 'I')
  }

  get aiswebAll(): string {
    return this.configService.get<string>('AISWEB_ALL', '1')
  }

  get aiswebMinutes(): number {
    return Number(this.configService.get<string>('AISWEB_MINUTES', '43200'))
  }

  get rplUrl(): string {
    return this.configService.getOrThrow<string>('RPL_URL')
  }

  get aeroviasAltaUrl(): string {
    return this.configService.getOrThrow<string>('AEROVIAS_ALTA_URL')
  }

  get aeroviasBaixaUrl(): string {
    return this.configService.getOrThrow<string>('AEROVIAS_BAIXA_URL')
  }

  get airportsUrl(): string {
    return this.configService.getOrThrow<string>('AIRPORTS_URL')
  }

  get waypointsUrl(): string {
    return this.configService.getOrThrow<string>('WAYPOINTS_URL')
  }

  get aeroviasUruguayCsvPath(): string {
    return this.configService.getOrThrow<string>('AEROVIAS_URUGUAY_CSV_PATH')
  }

  get aeroviasArgentinaCsvPath(): string {
    return this.configService.getOrThrow<string>('AEROVIAS_ARGENTINA_CSV_PATH')
  }

  get frontendOrigin(): string {
    return this.configService.get<string>('FRONTEND_ORIGIN', 'http://localhost:5173')
  }

  get port(): number {
    return Number(this.configService.get<string>('PORT', '8000'))
  }
}