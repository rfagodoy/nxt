import { Module } from '@nestjs/common'
import { InstancesService } from './instances.service'
import { InstancesController } from './instances.controller'
import { PrismaService } from '../prisma.service'

@Module({
  controllers: [InstancesController],
  providers: [InstancesService, PrismaService],
  exports: [InstancesService],
})
export class InstancesModule {}
