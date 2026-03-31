import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { EnvService } from 'src/config/env.service'
import { PrismaService } from './prisma.service'

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  providers: [EnvService, PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}