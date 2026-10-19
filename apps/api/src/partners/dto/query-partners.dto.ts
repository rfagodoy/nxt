import { IsOptional, IsString, IsNumber, IsArray, ValidateNested, IsIn } from 'class-validator'
import { Type } from 'class-transformer'

export class SortDto {
  @IsOptional()
  @IsString()
  col: string

  @IsOptional()
  @IsIn(['asc', 'desc'])
  dir: 'asc' | 'desc'
}

export class FilterItemDto {
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

export class QueryPartnersDto {
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
  @Type(() => SortDto)
  sort?: SortDto

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FilterItemDto)
  filters?: FilterItemDto[]

  @IsOptional()
  @IsIn(['AND', 'OR'])
  logic?: 'AND' | 'OR'

  /** Status exato (indicador clicado na lista). */
  @IsOptional()
  @IsIn(['ATIVO', 'INATIVO', 'EM_CADASTRAMENTO'])
  status?: string

  /** Filtro na coluna: "contém", sempre em E. O `op` é ignorado. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FilterItemDto)
  columnFilters?: FilterItemDto[]
}
