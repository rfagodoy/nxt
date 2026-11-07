import { IsString, IsOptional, IsObject, IsIn } from 'class-validator'
import { TIPOS_DE_WORKFLOW } from '@nxt/types'
import { ApiProperty } from '@nestjs/swagger'

export class CreateProcessDto {
  @ApiProperty()
  @IsString()
  name: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string

  @ApiProperty()
  @IsString()
  bpmnXml: string

  @ApiProperty()
  @IsObject()
  formSchema: Record<string, unknown>

  /** Obrigatório: todo workflow tem tipo (PO, 07/11/2026). */
  @ApiProperty({ enum: TIPOS_DE_WORKFLOW, description: 'CONTRATO | ADITIVO | DISTRATO (encerramento)' })
  @IsIn(TIPOS_DE_WORKFLOW, { message: 'Informe o tipo do workflow: contrato, aditivo ou encerramento.' })
  kind: string
}
