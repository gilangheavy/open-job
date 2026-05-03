import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { CompanyResponseDto } from '../../companies/dto/company-response.dto';
import type { CategoryResponseDto } from '../../categories/dto/category-response.dto';

export class JobResponseDto {
  @ApiProperty({ example: '01935b1c-a3d4-7c5e-8f9a-0b1c2d3e4f50', description: 'Job UUID' })
  id!: string;

  @ApiProperty({ example: 'Backend Engineer' })
  title!: string;

  @ApiPropertyOptional({ example: 'We are looking for a skilled backend engineer...', nullable: true })
  description!: string | null;

  @ApiPropertyOptional({ example: 'Jakarta, Indonesia', nullable: true })
  location!: string | null;

  @ApiPropertyOptional({ example: 15000000, nullable: true })
  salary!: number | null;

  @ApiProperty({ example: 'Full-time' })
  type!: string;

  @ApiProperty({ description: 'Company information' })
  company!: CompanyResponseDto;

  @ApiProperty({ description: 'Category information' })
  category!: CategoryResponseDto;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
