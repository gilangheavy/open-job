import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCompanyDto {
  @ApiProperty({ example: 'Acme Corp', maxLength: 150 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional({ example: 'A leading tech company' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 'Jakarta, Indonesia', maxLength: 150 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  location!: string;
}
