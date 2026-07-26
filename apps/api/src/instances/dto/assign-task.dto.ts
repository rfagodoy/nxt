import { IsString, IsNotEmpty, MaxLength } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class AssignTaskDto {
  @ApiProperty({ description: 'Id do usuário que passa a ser o responsável pela tarefa' })
  @IsString()
  @IsNotEmpty({ message: 'Escolha para quem delegar a tarefa' })
  userId!: string

  /** Motivo é OBRIGATÓRIO, como na devolução: quem recebe a tarefa de outra pessoa
   *  precisa saber por quê, e o histórico do processo tem de explicar a troca. */
  @ApiProperty({ description: 'Motivo da delegação (obrigatório)' })
  @IsString()
  @IsNotEmpty({ message: 'Informe o motivo da delegação' })
  @MaxLength(2000)
  reason!: string
}
