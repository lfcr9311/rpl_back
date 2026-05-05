import { Controller, Get } from '@nestjs/common'
import { WaypointsService } from '../service/waypoints'

@Controller('waypoints')
export class WaypointsController {
  constructor(private readonly service: WaypointsService) {}

  @Get()
  findAll() {
    return this.service.findAll()
  }

  @Get('geojson')
  findGeo() {
    return this.service.findAsGeoJson()
  }
}