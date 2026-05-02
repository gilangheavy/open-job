import { Transform } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../profile/dto/pagination-query.dto';

export class JobQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  @Transform(
    ({ obj }: { obj: Record<string, string> }) => obj['company-name'] ?? undefined,
  )
  companyName?: string;
}
