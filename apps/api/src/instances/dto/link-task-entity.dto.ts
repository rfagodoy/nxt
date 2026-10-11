import { IsString, MinLength } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class LinkTaskEntityDto {
  @ApiProperty({ description: 'Id do contrato/parceiro que a atividade de Tela acabou de gravar' })
  @IsString()
  @MinLength(1)
  entityId!: string
}
