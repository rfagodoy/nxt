import { IsString, IsOptional, IsObject, IsBoolean } from 'class-validator'
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

  @ApiProperty({ required: false, description: 'CONTRATO | ADITIVO' })
  @IsOptional() @IsString()
  kind?: string

  /** Libera uma gravação que reduz drasticamente o desenho (zera as atividades ou corta
   *  metade delas). Sem isto a API recusa com 409 — ver a guarda em `update()`. A tela
   *  só manda `true` depois de o usuário confirmar, ciente do que será removido. */
  @ApiProperty({ required: false, description: 'Confirma gravação que remove grande parte das atividades' })
  @IsOptional() @IsBoolean()
  confirmarReducao?: boolean
}
