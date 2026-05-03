export class ApplicationResponseDto {
  id!: string; // UUID
  jobId!: string; // Job UUID
  userId!: string; // Applicant UUID
  status!: string;
  createdAt!: Date;
  updatedAt!: Date;
}
