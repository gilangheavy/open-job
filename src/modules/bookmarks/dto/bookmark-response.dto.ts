import { ApiProperty } from '@nestjs/swagger';

export class BookmarkResponseDto {
  @ApiProperty({ example: '01935b1c-a3d4-7c5e-8f9a-0b1c2d3e4f50', description: 'Bookmark UUID' })
  id!: string;

  @ApiProperty({ example: '01935b1c-a3d4-7c5e-8f9a-0b1c2d3e4f51', description: 'Job UUID' })
  jobId!: string;

  @ApiProperty({ example: '01935b1c-a3d4-7c5e-8f9a-0b1c2d3e4f52', description: 'User UUID' })
  userId!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
