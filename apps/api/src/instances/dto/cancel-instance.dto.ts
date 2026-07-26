import { IsString, IsNotEmpty, MaxLength } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class CancelInstanceDto {
  /** Cancelar interrompe trabalho de outras pessoas — sem motivo registrado, a
   *  linha do tempo do processo termina num silêncio que ninguém sabe explicar. */
  @ApiProperty({ description: 'Motivo do cancelamento (obrigatório)' })
  @IsString()
  @IsNotEmpty({ message: 'Informe o motivo do cancelamento' })
  @MaxLength(2000)
  reason!: string
}
