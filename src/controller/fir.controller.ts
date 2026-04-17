import { Controller, Get } from '@nestjs/common'
import { FirService } from '../service/fir.service'

@Controller('api/firs')
export class FirController {
  constructor(private readonly firService: FirService) {}

  @Get()
  async findAll() {
    return this.firService.findAll()
  }
}