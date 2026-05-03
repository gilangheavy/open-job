import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../profile/dto/pagination-query.dto';

export class JobQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: 'Backend Engineer',
    description: 'Filter by job title (partial match)',
  })
  @IsOptional()
  @IsString()
  title?: string;

  // Populated by companyNameQueryMiddleware in JobsModule, which remaps
  // ?company-name → ?companyName before the global ValidationPipe runs.
  @ApiPropertyOptional({
    name: 'company-name',
    example: 'Acme Corp',
    description: 'Filter by company name (partial match)',
  })
  @IsOptional()
  @IsString()
  companyName?: string;
}
