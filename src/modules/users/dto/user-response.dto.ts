import { ApiProperty } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({
    example: '01935b1c-a3d4-7c5e-8f9a-0b1c2d3e4f50',
    description: 'User UUID (public identifier)',
  })
  id!: string;

  @ApiProperty({ example: 'John Doe' })
  fullname!: string;

  @ApiProperty({ example: 'john.doe@example.com' })
  email!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
