import { Controller, Get, Query } from '@nestjs/common'
import * as specialAreasModel from 'src/models/notams/special-areas.model'
import { SpecialAreasService } from 'src/service/special-areas.service'


@Controller('special-areas')
export class SpecialAreasController {
  constructor(private readonly specialAreasService: SpecialAreasService) {}

  @Get()
  async findAll(
    @Query('type') type?: specialAreasModel.SpecialAreaType,
  ): Promise<specialAreasModel.SpecialAreaModel[]> {
    if (type === 'D' || type === 'P' || type === 'R') {
      return this.specialAreasService.findByType(type)
    }

    return this.specialAreasService.findAll()
  }
}