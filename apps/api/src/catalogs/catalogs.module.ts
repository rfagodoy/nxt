import { Module } from '@nestjs/common'
import { CatalogsService } from './catalogs.service'
import { CatalogsController } from './catalogs.controller'
import { PrismaService } from '../prisma.service'

@Module({
  controllers: [CatalogsController],
  providers: [CatalogsService, PrismaService],
})
export class CatalogsModule {}
