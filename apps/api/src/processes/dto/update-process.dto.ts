import { IsString, IsOptional, IsObject, IsBoolean, IsIn, ValidateIf } from 'class-validator'
import { TIPOS_DE_WORKFLOW } from '@nxt/types'
import { ApiProperty } from '@nestjs/swagger'

/** Atualização parcial de um processo (edição no designer). Alterar o diagrama
 *  (bpmnXml) ou os campos (formSchema) volta o processo a Rascunho até reativar. */
export class UpdateProcessDto {
  @ApiProperty({ required: false })
  @IsOptional() @IsString()
  name?: string

  @ApiProperty({ required: false })
  @IsOptional() @IsString()
  description?: string

  @ApiProperty({ required: false })
  @IsOptional() @IsString()
  bpmnXml?: string

  @ApiProperty({ required: false })
  @IsOptional() @IsObject()
  formSchema?: Record<string, unknown>

  /** Pode trocar entre os tipos, mas não apagar: todo workflow tem tipo (PO, 07/11/2026).
   *  Ausente = não mexe; vazio ou nulo é recusado (por isso ValidateIf, não IsOptional). */
  @ApiProperty({ required: false, enum: TIPOS_DE_WORKFLOW, description: 'CONTRATO | ADITIVO | DISTRATO (encerramento)' })
  @ValidateIf((o: UpdateProcessDto) => o.kind !== undefined)
  @IsIn(TIPOS_DE_WORKFLOW, { message: 'Informe o tipo do workflow: contrato, aditivo ou encerramento.' })
  kind?: string

  /** Libera uma gravação que reduz drasticamente o desenho (zera as atividades ou corta
   *  metade delas). Sem isto a API recusa com 409 — ver a guarda em `update()`. A tela
   *  só manda `true` depois de o usuário confirmar, ciente do que será removido. */
  @ApiProperty({ required: false, description: 'Confirma gravação que remove grande parte das atividades' })
  @IsOptional() @IsBoolean()
  confirmarReducao?: boolean
}
