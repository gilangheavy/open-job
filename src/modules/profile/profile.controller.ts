import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserResponseDto } from '../users/dto/user-response.dto';
import {
  PaginatedResult,
  PaginationQueryDto,
} from './dto/pagination-query.dto';
import { ProfileApplicationResponseDto } from './dto/profile-application-response.dto';
import { ProfileBookmarkResponseDto } from './dto/profile-bookmark-response.dto';

@UseGuards(JwtAuthGuard)
@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  getProfile(@CurrentUser() user: JwtPayload): Promise<UserResponseDto> {
    return this.profileService.getProfile(user.id);
  }

  @Get('applications')
  getApplications(
    @CurrentUser() user: JwtPayload,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<ProfileApplicationResponseDto>> {
    return this.profileService.getApplications(user.id, query);
  }

  @Get('bookmarks')
  getBookmarks(
    @CurrentUser() user: JwtPayload,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<ProfileBookmarkResponseDto>> {
    return this.profileService.getBookmarks(user.id, query);
  }
}
