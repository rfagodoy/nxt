import { IsEmail, IsString, MinLength } from 'class-validator'

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  email: string
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(1)
  token: string

  /* O tamanho mínimo real é cobrado por assertStrongPassword, que devolve a mensagem
     explicando a política. Aqui só barramos o campo vazio: duplicar a regra faria a
     mensagem depender de qual validação disparou primeiro. */
  @IsString()
  @MinLength(1)
  newPassword: string
}
