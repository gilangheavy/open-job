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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
  ApiHeader,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { THROTTLER_LIMITS } from '../../common/constants/throttler.constants';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: THROTTLER_LIMITS.strict })
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiBody({ type: CreateUserDto })
  @ApiResponse({
    status: 201,
    description: 'User registered successfully',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  async register(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return this.usersService.create(dto);
  }

  @Get(':uuid')
  @ApiOperation({ summary: 'Get user by UUID' })
  @ApiParam({ name: 'uuid', description: 'User UUID' })
  @ApiHeader({
    name: 'X-Data-Source',
    required: false,
    description: 'cache | database',
  })
  @ApiResponse({
    status: 200,
    description: 'User found',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getProfile(
    @Param('uuid') uuid: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<UserResponseDto> {
    const { data, source } = await this.usersService.findByUuid(uuid);
    res.header('X-Data-Source', source);
    return data;
  }
}
