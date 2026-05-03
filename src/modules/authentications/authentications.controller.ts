import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Post,
  Put,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthenticationsService } from './authentications.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';
import { THROTTLER_LIMITS } from '../../common/constants/throttler.constants';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import type { TokenPair, AccessTokenResponse } from './authentications.service';

@ApiTags('Authentications')
@Controller('authentications')
export class AuthenticationsController {
  constructor(
    private readonly authenticationsService: AuthenticationsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: THROTTLER_LIMITS.moderate })
  @ApiOperation({ summary: 'Login and obtain JWT token pair' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 201, description: 'Login successful — returns access & refresh tokens' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() dto: LoginDto): Promise<TokenPair> {
    return this.authenticationsService.login(dto);
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: THROTTLER_LIMITS.moderate })
  @ApiOperation({ summary: 'Refresh access token using a refresh token' })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({ status: 200, description: 'Returns a new access token' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refresh(@Body() dto: RefreshTokenDto): Promise<AccessTokenResponse> {
    return this.authenticationsService.refresh(dto);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @SkipTransform()
  @ApiOperation({ summary: 'Logout and invalidate refresh token' })
  @ApiBody({ type: LogoutDto })
  @ApiResponse({ status: 200, description: 'Logout successful' })
  async logout(
    @Body() dto: LogoutDto,
  ): Promise<{ status: string; message: string }> {
    await this.authenticationsService.logout(dto);
    return { status: 'success', message: 'Logout successful' };
  }
}
