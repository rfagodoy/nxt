import { IsString } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class StartInstanceDto {
  @ApiProperty()
  @IsString()
  processDefinitionId: string

  @ApiProperty()
  @IsString()
  organizationId: string
}
