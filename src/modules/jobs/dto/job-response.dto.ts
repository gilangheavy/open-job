import type { CompanyResponseDto } from '../../companies/dto/company-response.dto';
import type { CategoryResponseDto } from '../../categories/dto/category-response.dto';

export class JobResponseDto {
  id!: string; // UUID
  title!: string;
  description!: string | null;
  location!: string | null;
  salary!: number | null;
  type!: string;
  company!: CompanyResponseDto;
  category!: CategoryResponseDto;
  createdAt!: Date;
  updatedAt!: Date;
}
