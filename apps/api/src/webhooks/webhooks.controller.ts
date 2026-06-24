import { Controller, Post, Headers, Body, RawBodyRequest, Req, HttpCode } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Webhook } from 'svix'
import { Request } from 'express'
import { OrganizationsService } from '../organizations/organizations.service'

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post('clerk')
  @HttpCode(200)
  async handleClerkWebhook(
    @Headers('svix-id') svixId: string,
    @Headers('svix-timestamp') svixTimestamp: string,
    @Headers('svix-signature') svixSignature: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    const secret = process.env.CLERK_WEBHOOK_SECRET
    if (!secret) return { received: true }

    const wh = new Webhook(secret)
    const payload = wh.verify(req.rawBody as Buffer, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as { type: string; data: Record<string, string> }

    if (payload.type === 'organization.created' || payload.type === 'organization.updated') {
      const { id, name, slug } = payload.data
      await this.organizationsService.upsert(id, name, slug)
    }

    return { received: true }
  }
}
