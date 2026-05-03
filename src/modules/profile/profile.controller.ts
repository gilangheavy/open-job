import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
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

@ApiTags('Profile')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  @ApiOperation({ summary: "Get the authenticated user's profile" })
  @ApiResponse({
    status: 200,
    description: 'User profile',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getProfile(@CurrentUser() user: JwtPayload): Promise<UserResponseDto> {
    return this.profileService.getProfile(user.id);
  }

  @Get('applications')
  @ApiOperation({
    summary: "Get the authenticated user's job applications (paginated)",
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Paginated list of applications' })
  getApplications(
    @CurrentUser() user: JwtPayload,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<ProfileApplicationResponseDto>> {
    return this.profileService.getApplications(user.id, query);
  }

  @Get('bookmarks')
  @ApiOperation({
    summary: "Get the authenticated user's bookmarked jobs (paginated)",
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Paginated list of bookmarks' })
  getBookmarks(
    @CurrentUser() user: JwtPayload,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<ProfileBookmarkResponseDto>> {
    return this.profileService.getBookmarks(user.id, query);
  }
}
