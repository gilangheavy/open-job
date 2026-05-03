import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export const APPLICATION_STATUSES = [
  'pending',
  'accepted',
  'rejected',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export class UpdateApplicationStatusDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(APPLICATION_STATUSES)
  status!: ApplicationStatus;
}
