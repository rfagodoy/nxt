import { IsString, IsNotEmpty, IsOptional, IsBoolean, MaxLength } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class CancelInstanceDto {
  /** Cancelar interrompe trabalho de outras pessoas — sem motivo registrado, a
   *  linha do tempo do processo termina num silêncio que ninguém sabe explicar. */
  @ApiProperty({ description: 'Motivo do cancelamento (obrigatório)' })
  @IsString()
  @IsNotEmpty({ message: 'Informe o motivo do cancelamento' })
  @MaxLength(2000)
  reason!: string

  /** Confirmação para desfazer efeitos que já valem para fora (contrato vigente ou
   *  com movimento). Sem ela, o cancelamento é recusado com a lista do que está em
   *  jogo — decidir sozinho sobre contrato assinado não é papel do sistema. */
  @ApiProperty({ description: 'Confirma o desfazimento de efeitos que exigem ciência', required: false })
  @IsOptional()
  @IsBoolean()
  confirmar?: boolean
}
