import { Module } from '@nestjs/common'
import { NotamsService } from '../service/notam.service' 
import { EnvService } from '../config/env.service'
import { NotamsController } from '../controller/notam.controller'
import { NotamGeometryService } from '../service/notam-geometry.service'
import { NotamHttpService } from '../service/notam-http.service'
import { ConfigModule } from '@nestjs/config'
import { NotamReadStateController } from 'src/controller/notam-read-state.controller'
import { NotamReadStateService } from 'src/service/notam-read-state.service'
import { PrismaService } from 'src/config/prisma.service'

@Module({
  imports: [ConfigModule],
  controllers: [NotamsController, NotamReadStateController],
  providers: [NotamsService, EnvService, NotamGeometryService, NotamHttpService, NotamReadStateService, PrismaService],
  exports: [NotamsService],
})
export class NotamsModule {}