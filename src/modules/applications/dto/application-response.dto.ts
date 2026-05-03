import { ApiProperty } from '@nestjs/swagger';

export class ApplicationResponseDto {
  @ApiProperty({ example: '01935b1c-a3d4-7c5e-8f9a-0b1c2d3e4f50', description: 'Application UUID' })
  id!: string;

  @ApiProperty({ example: '01935b1c-a3d4-7c5e-8f9a-0b1c2d3e4f51', description: 'Job UUID' })
  jobId!: string;

  @ApiProperty({ example: '01935b1c-a3d4-7c5e-8f9a-0b1c2d3e4f52', description: 'Applicant user UUID' })
  userId!: string;

  @ApiProperty({ example: 'pending', enum: ['pending', 'accepted', 'rejected'] })
  status!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
