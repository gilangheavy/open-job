import { ApiProperty } from '@nestjs/swagger';
import { JobSummaryDto } from './profile-application-response.dto';

export class ProfileBookmarkResponseDto {
  @ApiProperty({ example: '01935b1c-a3d4-7c5e-8f9a-0b1c2d3e4f50' })
  id!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ type: () => JobSummaryDto })
  job!: JobSummaryDto;
}
