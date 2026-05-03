import { IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateApplicationDto {
  @ApiProperty({
    example: '01935b1c-a3d4-7c5e-8f9a-0b1c2d3e4f50',
    description: 'UUID of the job to apply to',
  })
  @IsUUID('4')
  @IsNotEmpty()
  jobId!: string;
}
