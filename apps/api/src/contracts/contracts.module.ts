import { Module } from '@nestjs/common'
import { ContractsService } from './contracts.service'
import { ContractsController } from './contracts.controller'
import { PrismaService } from '../prisma.service'
import { FilesModule } from '../files/files.module'

/* FilesModule: excluir um contrato tem que levar os anexos junto. Sem isso, cada
   exclusão deixa PDFs órfãos no storage — invisíveis, sem dono e sem prazo. */
@Module({
  imports: [FilesModule],
  controllers: [ContractsController],
  providers: [ContractsService, PrismaService],
  exports: [ContractsService],
})
export class ContractsModule {}
