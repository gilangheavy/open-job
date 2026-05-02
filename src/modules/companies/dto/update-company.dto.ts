import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateCompanyDto {
  @IsString()
  @IsOptional()
  @MaxLength(150)
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(150)
  location?: string;
}
