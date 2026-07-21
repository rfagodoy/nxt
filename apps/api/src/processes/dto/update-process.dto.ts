import { IsString, IsOptional, IsObject } from 'class-validator'
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

  @ApiProperty({ required: false, description: 'CONTRATO | ADITIVO | PARCEIRO' })
  @IsOptional() @IsString()
  kind?: string
}
