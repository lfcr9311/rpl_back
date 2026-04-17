import { Body, Controller, Get, Post, Query } from '@nestjs/common'
import { NotamsService } from '../service/notam.service'
import { NotamReadStateService } from '../service/notam-read-state.service'

type SetReadStateBody = {
  sourceId?: string | null
  numeroNotam: string
  fir?: string | null
  lido: boolean
}

@Controller('notams')
export class NotamsController {
  constructor(
    private readonly notamsService: NotamsService,
    private readonly notamReadStateService: NotamReadStateService,
  ) {}

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

  @Get('read-states')
  getReadStates(@Query('fir') fir?: string) {
    return this.notamReadStateService.buildReadStateMap()
  }

  @Post('read-state')
  setReadState(@Body() body: SetReadStateBody) {
    return this.notamReadStateService.setReadState({
      sourceId: body.sourceId,
      numeroNotam: body.numeroNotam,
      fir: body.fir,
      lido: body.lido,
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