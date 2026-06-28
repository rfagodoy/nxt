import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator'

export class CreateUserDto {
  @IsString()
  @MinLength(1)
  name: string

  @IsEmail()
  email: string

  @IsString()
  @MinLength(8)
  password: string

  @IsOptional()
  @IsIn(['admin', 'user'])
  role?: 'admin' | 'user'
}
