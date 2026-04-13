import { IsOptional, IsString } from 'class-validator'

export class GetNotamReadStatesDto {
  @IsOptional()
  @IsString()
  fir?: string
}