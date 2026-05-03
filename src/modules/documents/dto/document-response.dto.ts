export class DocumentResponseDto {
  id!: string; // UUID
  userId!: string; // User UUID
  originalName!: string;
  mimeType!: string;
  size!: number;
  presignedUrl!: string;
  createdAt!: Date;
  updatedAt!: Date;
}
