export class UserResponseDto {
  id!: string; // UUID — exposed as public identifier
  fullname!: string;
  email!: string;
  createdAt!: Date;
  updatedAt!: Date;
}
