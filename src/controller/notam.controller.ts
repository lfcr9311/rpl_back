import { Controller, Get, Post, Query } from '@nestjs/common'
import { NotamsService } from 'src/service/notam.service'

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
    return { ok: true }
  }

  @Post('refresh')
  refresh() {
    return this.notamsService.findAreasFromApiByTargetFirs()
  }

  @Get('notams')
  findAll() {
    return this.notamsService.getRemoteNotams()
  }

  @Get('firs')
  findNotamsByFirs() {
    return this.notamsService.findAreasFromApiByTargetFirs()
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

  @Get('aerovias/uruguay')
  importAeroviasUruguay() {
    return this.notamsService.importAeroviasUruguay()
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