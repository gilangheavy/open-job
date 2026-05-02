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
import { AuthenticationsService } from './authentications.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';
import { THROTTLER_LIMITS } from '../../common/constants/throttler.constants';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import type { TokenPair, AccessTokenResponse } from './authentications.service';

@Controller('authentications')
export class AuthenticationsController {
  constructor(
    private readonly authenticationsService: AuthenticationsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: THROTTLER_LIMITS.moderate })
  async login(@Body() dto: LoginDto): Promise<TokenPair> {
    return this.authenticationsService.login(dto);
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: THROTTLER_LIMITS.moderate })
  async refresh(@Body() dto: RefreshTokenDto): Promise<AccessTokenResponse> {
    return this.authenticationsService.refresh(dto);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @SkipTransform()
  async logout(
    @Body() dto: LogoutDto,
  ): Promise<{ status: string; message: string }> {
    await this.authenticationsService.logout(dto);
    return { status: 'success', message: 'Logout successful' };
  }
}
