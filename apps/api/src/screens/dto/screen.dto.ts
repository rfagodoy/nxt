import { Type } from 'class-transformer'
import {
  IsArray, IsBoolean, IsInt, IsOptional, IsString, ValidateNested,
} from 'class-validator'

/* ─── Definição da Tela (Screen) ─────────────────────────────────────────── */

export class ScreenFieldOptionDto {
  @IsString() value!: string
  @IsString() label!: string
}

export class ScreenFieldValidationDto {
  @IsOptional() @IsInt() maxLength?: number
  @IsOptional() min?: number
  @IsOptional() max?: number
  @IsOptional() @IsString() pattern?: string
}

export class ScreenFieldDto {
  @IsString() id!: string
  @IsOptional() @IsString() sectionId?: string
  @IsString() name!: string
  @IsString() label!: string
  @IsString() type!: string
  @IsString() source!: string            // NATIVE | CUSTOM
  @IsOptional() @IsString() nativeKey?: string
  @IsString() mode!: string              // VIEW | EDIT
  @IsOptional() @IsBoolean() visible?: boolean   // nativo: liga/desliga no cadastro
  @IsBoolean() required!: boolean
  @IsOptional() @IsString() placeholder?: string
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ScreenFieldOptionDto)
  options?: ScreenFieldOptionDto[]
  @IsOptional() @ValidateNested() @Type(() => ScreenFieldValidationDto)
  validation?: ScreenFieldValidationDto
  @IsOptional() @IsArray() @IsString({ each: true })
  hiddenCategories?: string[]   // tipos de parceiro onde o campo é oculto (visibilidade por tipo)
  @IsOptional() @IsArray() @IsString({ each: true })
  requiredCategories?: string[] // tipos de parceiro onde o campo é obrigatório (por tipo; ausente = required global)
  @IsInt() order!: number
}

export class ScreenSectionDto {
  @IsString() id!: string
  @IsString() label!: string
  @IsString() name!: string
  @IsOptional() @IsString() source?: string      // NATIVE | CUSTOM
  @IsOptional() @IsString() nativeKey?: string
  @IsOptional() @IsBoolean() visible?: boolean
  @IsInt() order!: number
  @IsBoolean() defaultOpen!: boolean
}

export class SaveScreenDto {
  @IsString() name!: string
  @IsOptional() @IsString() description?: string
  @IsString() subjectType!: string       // FORNECEDOR | CONTRATO | GENERICA
  @IsOptional() @IsString() status?: string
  @IsOptional() @IsBoolean() isDefault?: boolean
  @IsOptional() @IsBoolean() isSystem?: boolean
  @IsArray() @ValidateNested({ each: true }) @Type(() => ScreenSectionDto)
  sections!: ScreenSectionDto[]
  @IsArray() @ValidateNested({ each: true }) @Type(() => ScreenFieldDto)
  fields!: ScreenFieldDto[]
}

/* ─── Valores preenchidos (ScreenFieldValue) ─────────────────────────────── */

export class ScreenValueDto {
  @IsString() fieldId!: string
  /** Valor canônico como texto (multiselect/checkbox chegam já serializados). */
  @IsString() value!: string
}

export class PutValuesDto {
  @IsString() subjectType!: string        // PARTNER | CONTRACT | PROCESS_INSTANCE
  @IsString() subjectId!: string
  @IsArray() @ValidateNested({ each: true }) @Type(() => ScreenValueDto)
  values!: ScreenValueDto[]
}

/** Leitura em lote: valores de VÁRIOS subjects de uma vez (listagem/exportação). */
export class BatchValuesDto {
  @IsString() subjectType!: string        // PARTNER | CONTRACT | PROCESS_INSTANCE
  @IsArray() @IsString({ each: true })
  subjectIds!: string[]
}
