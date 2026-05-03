import {
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateJobDto {
  @ApiPropertyOptional({ example: 'Senior Backend Engineer', maxLength: 200 })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ example: 'We are looking for a senior backend engineer...' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 'Bandung, Indonesia', maxLength: 150 })
  @IsString()
  @IsOptional()
  @MaxLength(150)
  location?: string;

  @ApiPropertyOptional({ example: 20000000, minimum: 0 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  salary?: number;

  @ApiPropertyOptional({ example: 'Part-time', maxLength: 50 })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  type?: string;
}
