import { Module } from '@nestjs/common'
import { NotamsModule } from './modules/notam.module';
import { PrismaModule } from 'prisma/prisma.module';

@Module({
  imports: [PrismaModule, NotamsModule],
})
export class AppModule {}