import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({
    example: 'John Doe',
    maxLength: 100,
    description: 'Full name of the user',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  fullname!: string;

  @ApiProperty({
    example: 'john.doe@example.com',
    maxLength: 150,
    description: 'User email address',
  })
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(150)
  email!: string;

  @ApiProperty({
    example: 'securePass1',
    minLength: 8,
    description: 'Password (min 8 characters)',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password!: string;
}
