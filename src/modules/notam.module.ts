import { Module } from '@nestjs/common'
import { NotamsService } from '../service/notam.service'
import { EnvService } from '../config/env.service'
import { NotamsController } from '../controller/notam.controller'
import { NotamGeometryService } from '../service/notam-geometry.service'
import { NotamHttpService } from '../service/notam-http.service'
import { ConfigModule } from '@nestjs/config'
import { NotamReadStateService } from '../service/notam-read-state.service'
import { NotamReadStateController } from '../controller/notam-read-state.controller'
import { DatabaseService } from '../config/database'
import { ManualRouteService } from '../service/manual-route.service'
import { ManualRouteController } from '../controller/manual-route.controller'
import { FirController } from '../controller/fir.controller'
import { FirService } from '../service/fir.service'
import { NavaidsService } from '../service/navaids.service'
import { NavaidsController } from '../controller/navaids.controller'

@Module({
  imports: [ConfigModule],
  controllers: [NotamsController, NotamReadStateController, ManualRouteController, FirController, NavaidsController],
  providers: [
    NotamsService, 
    EnvService, NotamGeometryService, 
    NotamHttpService, NotamReadStateService, 
    DatabaseService, 
    ManualRouteService,
    FirService,
    NavaidsService
  ],
  exports: [NotamsService],
})
export class NotamsModule { }