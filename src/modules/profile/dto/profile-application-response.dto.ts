export class JobSummaryDto {
  id!: string;
  title!: string;
  location!: string;
  type!: string;
  salary!: string | null;
}

export class ProfileApplicationResponseDto {
  id!: string;
  status!: string;
  createdAt!: Date;
  job!: JobSummaryDto;
}
