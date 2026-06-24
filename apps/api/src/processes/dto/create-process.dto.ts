import { IsString, IsOptional, IsObject } from 'class-validator'
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

  @ApiProperty()
  @IsString()
  organizationId: string
}
