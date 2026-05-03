import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateJobDto {
  @ApiProperty({
    example: '01935b1c-a3d4-7c5e-8f9a-0b1c2d3e4f50',
    description: 'Company UUID',
  })
  @IsUUID()
  @IsNotEmpty()
  companyId!: string;

  @ApiProperty({
    example: '01935b1c-a3d4-7c5e-8f9a-0b1c2d3e4f51',
    description: 'Category UUID',
  })
  @IsUUID()
  @IsNotEmpty()
  categoryId!: string;

  @ApiProperty({ example: 'Backend Engineer', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({
    example: 'We are looking for a skilled backend engineer...',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 'Jakarta, Indonesia', maxLength: 150 })
  @IsString()
  @IsOptional()
  @MaxLength(150)
  location?: string;

  @ApiPropertyOptional({
    example: 15000000,
    minimum: 0,
    description: 'Salary in IDR',
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  salary?: number;

  @ApiProperty({ example: 'Full-time', maxLength: 50 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  type!: string;
}
