import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { UsersService } from './users.service'
import { CreateUserDto } from './dto/create-user.dto'
import { UpdateUserDto } from './dto/update-user.dto'
import { ChangePasswordDto } from './dto/change-password.dto'
import { CurrentOrg } from '../auth/current-org.decorator'
import { Roles } from '../auth/roles.decorator'
import { RolesGuard } from '../auth/roles.guard'

// Gestão de usuários — restrita a administradores do tenant.
@Controller('users')
@UseGuards(RolesGuard)
@Roles('admin')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@CurrentOrg() organizationId: string) {
    return this.users.list(organizationId)
  }

  // Lista mínima para seletores de usuário (Responsáveis etc.). Liberada a qualquer
  // autenticado — o @Roles do método SOBRESCREVE o 'admin' da classe (getAllAndOverride).
  @Get('selectable')
  @Roles('admin', 'user')
  selectable(@CurrentOrg() organizationId: string) {
    return this.users.selectable(organizationId)
  }

  @Post()
  create(@CurrentOrg() organizationId: string, @Body() dto: CreateUserDto) {
    return this.users.create(organizationId, dto)
  }

  @Patch(':id')
  update(
    @CurrentOrg() organizationId: string,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.users.update(organizationId, id, dto)
  }

  @Patch(':id/password')
  changePassword(
    @CurrentOrg() organizationId: string,
    @Param('id') id: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.users.changePassword(organizationId, id, dto.password)
  }
}
