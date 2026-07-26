import { IsString, IsNotEmpty, MaxLength } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class TransferTasksDto {
  @ApiProperty({ description: 'Usuário que hoje responde pelas tarefas' })
  @IsString()
  @IsNotEmpty({ message: 'Escolha de quem transferir as tarefas' })
  fromUserId!: string

  @ApiProperty({ description: 'Usuário que passa a responder pelas tarefas' })
  @IsString()
  @IsNotEmpty({ message: 'Escolha para quem transferir as tarefas' })
  toUserId!: string

  /** Motivo é OBRIGATÓRIO: mover o trabalho de alguém sem registrar o porquê deixa
   *  o histórico de vários processos com uma troca inexplicada. */
  @ApiProperty({ description: 'Motivo da transferência (obrigatório)' })
  @IsString()
  @IsNotEmpty({ message: 'Informe o motivo da transferência' })
  @MaxLength(2000)
  reason!: string
}
