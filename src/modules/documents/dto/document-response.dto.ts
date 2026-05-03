import { ApiProperty } from '@nestjs/swagger';

export class DocumentResponseDto {
  @ApiProperty({ example: '01935b1c-a3d4-7c5e-8f9a-0b1c2d3e4f50', description: 'Document UUID' })
  id!: string;

  @ApiProperty({ example: '01935b1c-a3d4-7c5e-8f9a-0b1c2d3e4f51', description: 'Owner user UUID' })
  userId!: string;

  @ApiProperty({ example: 'my-resume.pdf' })
  originalName!: string;

  @ApiProperty({ example: 'application/pdf' })
  mimeType!: string;

  @ApiProperty({ example: 204800, description: 'File size in bytes' })
  size!: number;

  @ApiProperty({ example: 'https://s3.example.com/bucket/uuid.pdf?X-Amz-Signature=...', description: 'Pre-signed S3 URL' })
  presignedUrl!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
