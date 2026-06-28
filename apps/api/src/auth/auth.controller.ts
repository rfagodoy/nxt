import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common'
import type { Request } from 'express'
import { AuthService } from './auth.service'
import { LoginDto } from './dto/login.dto'
import { RefreshDto } from './dto/refresh.dto'
import { ChangePasswordDto } from './dto/change-password.dto'
import { Public } from './public.decorator'
import { CurrentUser, CurrentUserData } from './current-user.decorator'
import { CurrentOrg } from './current-org.decorator'
import { clientContext } from './request-context'

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Login por e-mail + senha. Emite access token curto + refresh token. */
  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto.email, dto.password, clientContext(req))
  }

  /** Renova o access token a partir do refresh (com rotação). */
  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    return this.auth.refresh(dto.refreshToken, clientContext(req))
  }

  /** Encerra a sessão revogando o refresh token. */
  @Public()
  @Post('logout')
  @HttpCode(200)
  logout(@Body() dto: RefreshDto) {
    return this.auth.logout(dto.refreshToken)
  }

  /** Dados do usuário autenticado (a partir das claims do token). */
  @Get('me')
  me(@CurrentUser() user: CurrentUserData, @CurrentOrg() organizationId: string) {
    return { ...user, organizationId }
  }

  /** Troca a própria senha (exige a senha atual); revoga as sessões. */
  @Post('change-password')
  @HttpCode(200)
  changePassword(@CurrentUser() user: CurrentUserData, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.sub, dto.currentPassword, dto.newPassword)
  }
}
