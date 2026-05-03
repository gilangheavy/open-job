import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export const APPLICATION_STATUSES = [
  'pending',
  'accepted',
  'rejected',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export class UpdateApplicationStatusDto {
  @ApiProperty({ example: 'accepted', enum: APPLICATION_STATUSES, description: 'New status for the application' })
  @IsString()
  @IsNotEmpty()
  @IsIn(APPLICATION_STATUSES)
  status!: ApplicationStatus;
}
