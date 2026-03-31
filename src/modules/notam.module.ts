import { Module } from '@nestjs/common'
import { NotamsService } from 'src/service/notam.service'
import { PrismaService } from 'prisma/prisma.service'
import { EnvService } from 'src/config/env.service'
import { NotamsController } from 'src/controller/notam.controller'
import { NotamGeometryService } from 'src/service/notam-geometry.service'
import { NotamHttpService } from 'src/service/notam-http.service'

@Module({
  controllers: [NotamsController],
  providers: [NotamsService, PrismaService, EnvService, NotamGeometryService, NotamHttpService],
  exports: [NotamsService],
})
export class NotamsModule {}