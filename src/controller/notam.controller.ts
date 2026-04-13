import { Controller, Get, Post, Query } from '@nestjs/common'
import { NotamsService } from '../service/notam.service'

@Controller('notams')
export class NotamsController {
  constructor(private readonly notamsService: NotamsService) {}

  @Get()
  findRemote(
    @Query('icaocode') icaocode?: string,
    @Query('minutes') minutes?: string,
  ) {
    const parsedMinutes =
      minutes && !Number.isNaN(Number(minutes)) ? Number(minutes) : undefined

    return this.notamsService.getRemoteNotams({
      icaocode: icaocode?.trim().toUpperCase(),
      minutes: parsedMinutes,
    })
  }

  @Get('health')
  health() {
    console.log('Health check')
    return { ok: true }
  }

  @Post('refresh')
  refresh(
    @Query('minutes') minutes?: string,
    @Query('includeRead') includeRead?: string,
  ) {
    const parsedMinutes =
      minutes && !Number.isNaN(Number(minutes)) ? Number(minutes) : undefined

    const incluirLidos =
      String(includeRead ?? '').trim().toLowerCase() === 'true'

    return this.notamsService.findAreasFromApiByTargetFirs(parsedMinutes, {
      incluirLidos,
    })
  }

  @Get('notams')
  findAll(
    @Query('icaocode') icaocode?: string,
    @Query('minutes') minutes?: string,
  ) {
    const parsedMinutes =
      minutes && !Number.isNaN(Number(minutes)) ? Number(minutes) : undefined

    return this.notamsService.getRemoteNotams({
      icaocode: icaocode?.trim().toUpperCase(),
      minutes: parsedMinutes,
    })
  }

  @Get('firs')
  findNotamsByFirs(
    @Query('minutes') minutes?: string,
    @Query('includeRead') includeRead?: string,
  ) {
    const parsedMinutes =
      minutes && !Number.isNaN(Number(minutes)) ? Number(minutes) : undefined

    const incluirLidos =
      String(includeRead ?? '').trim().toLowerCase() === 'true'

    return this.notamsService.findAreasFromApiByTargetFirs(parsedMinutes, {
      incluirLidos,
    })
  }

  @Get('areas')
  findAreas(
    @Query('minutes') minutes?: string,
    @Query('includeRead') includeRead?: string,
  ) {
    const parsedMinutes =
      minutes && !Number.isNaN(Number(minutes)) ? Number(minutes) : undefined

    const incluirLidos =
      String(includeRead ?? '').trim().toLowerCase() === 'true'

    return this.notamsService.findAreasFromApiByTargetFirs(parsedMinutes, {
      incluirLidos,
    })
  }

  @Get('aerovias/alta')
  importAeroviasAlta() {
    return this.notamsService.importAeroviasAlta()
  }

  @Get('aerovias/baixa')
  importAeroviasBaixa() {
    return this.notamsService.importAeroviasBaixa()
  }

  @Get('aerovias/todas')
  importAeroviasTodas() {
    return this.notamsService.importAeroviasTodas()
  }

  @Get('rpl')
  importRpl() {
    return this.notamsService.importRpl()
  }

  @Get('aeroportos')
  importAeroportos() {
    return this.notamsService.importAeroportos()
  }

  @Get('waypoints')
  importWaypoints() {
    return this.notamsService.importWaypoints()
  }
}