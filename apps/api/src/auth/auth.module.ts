import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'
import { JwtStrategy } from './jwt.strategy'
import { AuthService } from './auth.service'
import { AuthController } from './auth.controller'
import { IpThrottleService } from './ip-throttle.service'
import { PrismaService } from '../prisma.service'

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [AuthController],
  providers: [JwtStrategy, AuthService, IpThrottleService, PrismaService],
  exports: [PassportModule, AuthService],
})
export class AuthModule {}
