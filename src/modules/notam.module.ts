import { Module } from '@nestjs/common'
import { NotamsService } from '../service/notam.service' 
import { PrismaService } from '../../prisma/prisma.service'
import { EnvService } from '../config/env.service'
import { NotamsController } from '../controller/notam.controller'
import { NotamGeometryService } from '../service/notam-geometry.service'
import { NotamHttpService } from '../service/notam-http.service'

@Module({
  controllers: [NotamsController],
  providers: [NotamsService, PrismaService, EnvService, NotamGeometryService, NotamHttpService],
  exports: [NotamsService],
})
export class NotamsModule {}