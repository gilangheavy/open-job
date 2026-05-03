import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class CreateApplicationDto {
  @IsUUID('4')
  @IsNotEmpty()
  jobId!: string;
}
