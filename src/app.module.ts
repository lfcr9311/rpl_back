import { Module } from '@nestjs/common'
import { NotamsModule } from './modules/notam.module';

@Module({
  imports: [NotamsModule],
})
export class AppModule {}