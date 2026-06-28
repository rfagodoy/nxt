import { IsIn, IsOptional, IsString, MinLength } from 'class-validator'

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string

  @IsOptional()
  @IsIn(['admin', 'user'])
  role?: 'admin' | 'user'

  @IsOptional()
  @IsIn(['ATIVO', 'INATIVO'])
  status?: 'ATIVO' | 'INATIVO'
}
