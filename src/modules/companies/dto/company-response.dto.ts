import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CompanyResponseDto {
  @ApiProperty({
    example: '01935b1c-a3d4-7c5e-8f9a-0b1c2d3e4f50',
    description: 'Company UUID',
  })
  id!: string;

  @ApiProperty({ example: 'Acme Corp' })
  name!: string;

  @ApiPropertyOptional({ example: 'A leading tech company', nullable: true })
  description!: string | null;

  @ApiProperty({ example: 'Jakarta, Indonesia' })
  location!: string;

  @ApiProperty({
    example: '01935b1c-a3d4-7c5e-8f9a-0b1c2d3e4f51',
    description: 'Owner user UUID',
  })
  userId!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
