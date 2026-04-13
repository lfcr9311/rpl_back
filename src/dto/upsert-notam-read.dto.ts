import { IsBoolean, IsOptional, IsString } from 'class-validator'

export class UpsertNotamReadDto {
  @IsString()
  sourceId!: string

  @IsString()
  numeroNotam!: string

  @IsOptional()
  @IsString()
  fir?: string

  @IsBoolean()
  lido!: boolean
}