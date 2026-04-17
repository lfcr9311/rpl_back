import { BadRequestException, Controller, Get, Query } from '@nestjs/common'
import { ManualRouteService } from '../service/manual-route.service'

@Controller('notams')
export class ManualRouteController {
  constructor(private readonly manualRouteService: ManualRouteService) {}

  @Get('rota-manual')
  async create(
    @Query('origem') origem: string,
    @Query('destino') destino: string,
  ) {
    const origemNorm = String(origem ?? '').trim().toUpperCase()
    const destinoNorm = String(destino ?? '').trim().toUpperCase()

    if (!origemNorm) {
      throw new BadRequestException('origem é obrigatória')
    }

    if (!destinoNorm) {
      throw new BadRequestException('destino é obrigatório')
    }

    return this.manualRouteService.create(origemNorm, destinoNorm)
  }
}