import { IsString, IsOptional, IsArray, IsBoolean, IsNumber } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class CreateContractDto {
  @ApiProperty()
  @IsString()
  numero: string

  @ApiProperty()
  @IsString()
  titulo: string

  @ApiProperty()
  @IsString()
  tipo: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  descricao?: string

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  objeto?: string[]

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  situacao?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  inicioVigencia?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  terminoVigencia?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  prazoIndeterminado?: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dataAssinatura?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  moeda?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  valorTotal?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  valorParcela?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  condicaoPagamento?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  complementoValor?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  renovacaoAutomatica?: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  observacoes?: string

  @ApiProperty({ type: [Object] })
  @IsArray()
  partes: object[]

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  reajustes?: object[]

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  documentos?: object[]

  @ApiPropertyOptional({ description: 'Usuário que originou o registro (para auditoria futura)' })
  @IsOptional()
  @IsString()
  user?: string
}
