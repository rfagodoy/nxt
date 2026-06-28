import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common'
import { AuthService } from './auth.service'
import { LoginDto } from './dto/login.dto'
import { Public } from './public.decorator'
import { CurrentUser, CurrentUserData } from './current-user.decorator'
import { CurrentOrg } from './current-org.decorator'

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Login por e-mail + senha. Rota aberta — emite o nosso JWT. */
  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password)
  }

  /** Dados do usuário autenticado (a partir das claims do token). */
  @Get('me')
  me(@CurrentUser() user: CurrentUserData, @CurrentOrg() organizationId: string) {
    return { ...user, organizationId }
  }
}
