import { Module } from '@nestjs/common'
import { WebhooksController } from './webhooks.controller'
import { OrganizationsModule } from '../organizations/organizations.module'

@Module({
  imports: [OrganizationsModule],
  controllers: [WebhooksController],
})
export class WebhooksModule {}
