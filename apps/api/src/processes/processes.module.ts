import { Module } from '@nestjs/common'
import { ProcessesService } from './processes.service'
import { ProcessesController } from './processes.controller'
import { PrismaService } from '../prisma.service'
import { ModuleGeneratorService } from '../modules/module-generator.service'

@Module({
  controllers: [ProcessesController],
  providers: [ProcessesService, PrismaService, ModuleGeneratorService],
  exports: [ProcessesService],
})
export class ProcessesModule {}
