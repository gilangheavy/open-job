import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { UserResponseDto } from '../users/dto/user-response.dto';

@Injectable()
export class ProfileService {
  constructor(private readonly usersService: UsersService) {}

  async getProfile(uuid: string): Promise<UserResponseDto> {
    const { data } = await this.usersService.findByUuid(uuid);
    return data;
  }
}
