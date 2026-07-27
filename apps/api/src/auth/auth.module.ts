import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'
import { JwtStrategy } from './jwt.strategy'
import { AuthService } from './auth.service'
import { AuthController } from './auth.controller'
import { IpThrottleService } from './ip-throttle.service'
import { PrismaService } from '../prisma.service'
import { NotificationsModule } from '../notifications/notifications.module'

@Module({
  // NotificationsModule entra pelo MailerService: sem canal de e-mail não há
  // recuperação de senha self-service (o link precisa chegar em algum lugar).
  imports: [PassportModule.register({ defaultStrategy: 'jwt' }), NotificationsModule],
  controllers: [AuthController],
  providers: [JwtStrategy, AuthService, IpThrottleService, PrismaService],
  exports: [PassportModule, AuthService],
})
export class AuthModule {}
