import { Body, Controller, Get, Patch, Query } from '@nestjs/common'
import { GetNotamReadStatesDto } from '../dto/get-notam-read-states.dto'
import { UpsertNotamReadDto } from '../dto/upsert-notam-read.dto'
import { NotamReadStateService } from '../service/notam-read-state.service'

@Controller('notams/read-state')
export class NotamReadStateController {
  constructor(
    private readonly notamReadStateService: NotamReadStateService,
  ) {}

  @Get()
  async list(@Query() query: GetNotamReadStatesDto) {
    return this.notamReadStateService.getReadStates()
  }

  @Patch()
  async upsert(@Body() body: UpsertNotamReadDto) {
    return this.notamReadStateService.setReadState({
      sourceId: body.sourceId,
      numeroNotam: body.numeroNotam,
      fir: body.fir,
      lido: body.lido,
    })
  }
}