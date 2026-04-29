import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { THROTTLER_LIMITS } from '../../common/constants/throttler.constants';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: THROTTLER_LIMITS.strict })
  async register(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return this.usersService.create(dto);
  }

  @Get(':uuid')
  async getProfile(
    @Param('uuid') uuid: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<UserResponseDto> {
    const { data, source } = await this.usersService.findByUuid(uuid);
    res.header('X-Data-Source', source);
    return data;
  }
}
