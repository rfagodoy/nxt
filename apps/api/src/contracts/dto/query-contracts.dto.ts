import { IsOptional, IsString, IsNumber, IsArray, ValidateNested, IsIn } from 'class-validator'
import { Type } from 'class-transformer'

/* Mesmo shape do QueryPartnersDto — o front usa a MESMA ListToolbar nas duas telas. */

export class ContractSortDto {
  @IsOptional()
  @IsString()
  col: string

  @IsOptional()
  @IsIn(['asc', 'desc'])
  dir: 'asc' | 'desc'
}

export class ContractFilterItemDto {
  @IsOptional()
  @IsString()
  col: string

  @IsOptional()
  @IsString()
  op: string

  @IsOptional()
  @IsString()
  value: string
}

export class QueryContractsDto {
  @IsOptional()
  @IsNumber()
  page?: number

  @IsOptional()
  @IsNumber()
  pageSize?: number

  @IsOptional()
  @IsString()
  search?: string

  @IsOptional()
  @ValidateNested()
  @Type(() => ContractSortDto)
  sort?: ContractSortDto

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContractFilterItemDto)
  filters?: ContractFilterItemDto[]

  @IsOptional()
  @IsIn(['AND', 'OR'])
  logic?: 'AND' | 'OR'
}
