import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../profile/dto/pagination-query.dto';

export class JobQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  title?: string;

  // Populated by companyNameQueryMiddleware in JobsModule, which remaps
  // ?company-name → ?companyName before the global ValidationPipe runs.
  @IsOptional()
  @IsString()
  companyName?: string;
}
