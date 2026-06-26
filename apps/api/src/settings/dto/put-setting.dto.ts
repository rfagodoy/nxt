import { IsString, IsOptional, Allow } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class PutSettingDto {
  @ApiPropertyOptional({ description: 'Vazio = nível organização; id do usuário quando houver login' })
  @IsOptional()
  @IsString()
  userId?: string

  // JSON arbitrário (objeto, array, string...). @Allow evita que o whitelist do
  // ValidationPipe descarte o campo.
  @ApiProperty({ type: Object })
  @Allow()
  value: unknown
}
