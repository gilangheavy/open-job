export class CompanyResponseDto {
  id!: string; // UUID
  name!: string;
  description!: string | null;
  location!: string;
  userId!: string; // Owner UUID
  createdAt!: Date;
  updatedAt!: Date;
}
