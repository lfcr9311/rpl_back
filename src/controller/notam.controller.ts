import { Controller, Get, Post, Query } from '@nestjs/common'
import { NotamsService } from '../service/notam.service'

@Controller('notams')
export class NotamsController {
  constructor(private readonly notamsService: NotamsService) {}

  @Get()
  findRemote(
    @Query('icaocode') icaocode?: string,
    @Query('fir') fir?: string,
    @Query('minutes') minutes?: string,
  ) {
    const parsedMinutes =
      minutes && !Number.isNaN(Number(minutes)) ? Number(minutes) : undefined

    return this.notamsService.getRemoteNotams({
      icaocode: icaocode?.trim().toUpperCase(),
      fir: fir?.trim().toUpperCase(),
      minutes: parsedMinutes,
    })
  }

  @Get('health')
  health() {
    console.log('Health check')
    return { ok: true }
  }

  @Post('refresh')
  refresh(@Query('minutes') minutes?: string) {
    const parsedMinutes =
      minutes && !Number.isNaN(Number(minutes)) ? Number(minutes) : undefined

    return this.notamsService.findAreasFromApiByTargetFirs(parsedMinutes)
  }

  @Get('notams')
  findAll(
    @Query('minutes') minutes?: string,
    @Query('fir') fir?: string,
  ) {
    const parsedMinutes =
      minutes && !Number.isNaN(Number(minutes)) ? Number(minutes) : undefined

    return this.notamsService.getRemoteNotams({
      fir: fir?.trim().toUpperCase(),
      minutes: parsedMinutes,
    })
  }

  @Get('firs')
  findNotamsByFirs(@Query('minutes') minutes?: string) {
    const parsedMinutes =
      minutes && !Number.isNaN(Number(minutes)) ? Number(minutes) : undefined

    return this.notamsService.findAreasFromApiByTargetFirs(parsedMinutes)
  }

  @Get('firs/raw')
  findNotamsByFirsRaw(@Query('minutes') minutes?: string) {
    const parsedMinutes =
      minutes && !Number.isNaN(Number(minutes)) ? Number(minutes) : undefined

    return this.notamsService.fetchRemoteNotamsFromAllTargetFirs(parsedMinutes)
  }

  @Get('aerovias/alta')
  importAeroviasAlta() {
    return this.notamsService.importAeroviasAlta()
  }

  @Get('aerovias/baixa')
  importAeroviasBaixa() {
    return this.notamsService.importAeroviasBaixa()
  }

  @Get('aerovias/uruguay')
  importAeroviasUruguay() {
    return this.notamsService.importAeroviasUruguay()
  }

  @Get('aerovias/argentina')
  importAeroviasArgentina() {
    return this.notamsService.importAeroviasArgentina()
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