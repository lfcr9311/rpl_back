import { Controller, Get } from '@nestjs/common'
import { NavaidsService } from '../service/navaids.service'

@Controller('notams/navaids')
export class NavaidsController {
  constructor(private readonly service: NavaidsService) {}

  @Get()
  findAll() {
    return this.service.findAll()
  }

  @Get('geojson')
  findGeoJson() {
    return this.service.findAsGeoJson()
  }
}