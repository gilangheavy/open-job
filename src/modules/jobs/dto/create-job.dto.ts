import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateJobDto {
  @IsUUID()
  @IsNotEmpty()
  companyId!: string;

  @IsUUID()
  @IsNotEmpty()
  categoryId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(150)
  location?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  salary?: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  type!: string;
}
