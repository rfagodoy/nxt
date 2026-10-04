import { Module } from '@nestjs/common'
import { PartnersService } from './partners.service'
import { PartnersController } from './partners.controller'
import { PrismaService } from '../prisma.service'
import { ScreensModule } from '../screens/screens.module'

@Module({
  imports: [ScreensModule],
  controllers: [PartnersController],
  providers: [PartnersService, PrismaService],
  exports: [PartnersService],
})
export class PartnersModule {}
