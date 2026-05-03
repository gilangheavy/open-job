import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class JobSummaryDto {
  @ApiProperty({ example: '01935b1c-a3d4-7c5e-8f9a-0b1c2d3e4f50' })
  id!: string;

  @ApiProperty({ example: 'Backend Engineer' })
  title!: string;

  @ApiProperty({ example: 'Jakarta, Indonesia' })
  location!: string;

  @ApiProperty({ example: 'Full-time' })
  type!: string;

  @ApiPropertyOptional({ example: '15000000', nullable: true })
  salary!: string | null;
}

export class ProfileApplicationResponseDto {
  @ApiProperty({ example: '01935b1c-a3d4-7c5e-8f9a-0b1c2d3e4f50' })
  id!: string;

  @ApiProperty({
    example: 'pending',
    enum: ['pending', 'accepted', 'rejected'],
  })
  status!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ type: () => JobSummaryDto })
  job!: JobSummaryDto;
}
