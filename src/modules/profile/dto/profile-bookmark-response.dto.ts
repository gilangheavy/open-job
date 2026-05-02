import { JobSummaryDto } from './profile-application-response.dto';

export class ProfileBookmarkResponseDto {
  id!: string;
  createdAt!: Date;
  job!: JobSummaryDto;
}
