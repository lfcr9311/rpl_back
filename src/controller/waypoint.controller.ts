import { Controller, Get } from '@nestjs/common'
import { WaypointsService } from '../service/waypoints'

@Controller('notams/waypoints')
export class WaypointsController {
  constructor(private readonly service: WaypointsService) {}

  @Get()
  findAll() {
    return this.service.findAll()
  }

  @Get('geojson')
  findGeoJson() {
    return this.service.findAsGeoJson()
  }
}