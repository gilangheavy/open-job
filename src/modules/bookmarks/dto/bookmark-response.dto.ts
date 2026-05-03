export class BookmarkResponseDto {
  id!: string; // UUID
  jobId!: string; // Job UUID
  userId!: string; // User UUID
  createdAt!: Date;
  updatedAt!: Date;
}
