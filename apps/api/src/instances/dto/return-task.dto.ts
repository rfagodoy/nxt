import { IsString, IsNotEmpty, MaxLength } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class ReturnTaskDto {
  @ApiProperty({ description: 'Id do nó (atividade humana anterior) para onde devolver' })
  @IsString()
  @IsNotEmpty({ message: 'Escolha a etapa para onde devolver' })
  targetNodeId!: string

  /** Motivo é OBRIGATÓRIO: sem ele o histórico não explica por que a etapa foi refeita. */
  @ApiProperty({ description: 'Motivo da devolução (obrigatório)' })
  @IsString()
  @IsNotEmpty({ message: 'Informe o motivo da devolução' })
  @MaxLength(2000)
  reason!: string
}
