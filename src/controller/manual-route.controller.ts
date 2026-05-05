import { Body, Controller, Post } from '@nestjs/common'
import type { ManualRouteRequestModel } from '../models/notams/manual-route.model'
import { ManualRouteService } from '../service/manual-route.service'

@Controller('notams/manual-route')
export class ManualRouteController {
  constructor(private readonly service: ManualRouteService) {}

  @Post()
  create(@Body() body: ManualRouteRequestModel) {
    return this.service.buildRoute(body)
  }
}