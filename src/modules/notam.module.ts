import { Module } from '@nestjs/common'
import { NotamsService } from '../service/notam.service' 
import { EnvService } from '../config/env.service'
import { NotamsController } from '../controller/notam.controller'
import { NotamGeometryService } from '../service/notam-geometry.service'
import { NotamHttpService } from '../service/notam-http.service'
import { ConfigModule } from '@nestjs/config'

@Module({
  imports: [ConfigModule],
  controllers: [NotamsController],
  providers: [NotamsService, EnvService, NotamGeometryService, NotamHttpService],
  exports: [NotamsService],
})
export class NotamsModule {}