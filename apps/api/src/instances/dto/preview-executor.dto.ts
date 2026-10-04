import { IsIn, IsObject, IsOptional, IsString } from 'class-validator'
import { Type } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'
import { ValidateNested } from 'class-validator'

export class ExecutorDto {
  @IsString() papelId!: string
  @IsString() entityType!: string
  @IsIn(['FIXA', 'VARIAVEL']) mode!: 'FIXA' | 'VARIAVEL'
  @IsOptional() @IsString() entityId?: string
  @IsOptional() @IsString() entityVar?: string
  @IsOptional() @IsString() stakeholder?: string
}

/** "Testar com um contrato" do editor: para quem a atividade iria hoje. */
export class PreviewExecutorDto {
  @ApiProperty() @IsObject() @ValidateNested() @Type(() => ExecutorDto)
  executor!: ExecutorDto

  @ApiProperty() @IsString()
  contratoId!: string
}
