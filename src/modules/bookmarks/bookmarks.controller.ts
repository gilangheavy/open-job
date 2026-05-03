import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiHeader,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { BookmarksService } from './bookmarks.service';
import { BookmarkResponseDto } from './dto/bookmark-response.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import {
  PaginationQueryDto,
  type PaginatedResult,
} from '../profile/dto/pagination-query.dto';

@ApiTags('Bookmarks')
@ApiBearerAuth('access-token')
@Controller()
export class BookmarksController {
  constructor(private readonly bookmarksService: BookmarksService) {}

  @Post('jobs/:jobId/bookmark')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Bookmark a job' })
  @ApiParam({ name: 'jobId', description: 'Job UUID' })
  @ApiResponse({
    status: 201,
    description: 'Job bookmarked',
    type: BookmarkResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  create(
    @CurrentUser() user: JwtPayload,
    @Param('jobId') jobId: string,
  ): Promise<BookmarkResponseDto> {
    return this.bookmarksService.create(user.id, jobId);
  }

  @Delete('jobs/:jobId/bookmark')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @SkipTransform()
  @ApiOperation({ summary: 'Remove a job bookmark' })
  @ApiParam({ name: 'jobId', description: 'Job UUID' })
  @ApiResponse({ status: 200, description: 'Bookmark removed' })
  @ApiResponse({ status: 404, description: 'Bookmark not found' })
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param('jobId') jobId: string,
  ): Promise<{ status: string; message: string }> {
    await this.bookmarksService.remove(user.id, jobId);
    return { status: 'success', message: 'Bookmark deleted successfully' };
  }

  @Get('jobs/:jobId/bookmark/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get a specific bookmark by UUID' })
  @ApiParam({ name: 'jobId', description: 'Job UUID' })
  @ApiParam({ name: 'id', description: 'Bookmark UUID' })
  @ApiResponse({
    status: 200,
    description: 'Bookmark found',
    type: BookmarkResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Bookmark not found' })
  findOne(
    @CurrentUser() user: JwtPayload,
    @Param('jobId') jobId: string,
    @Param('id') id: string,
  ): Promise<BookmarkResponseDto> {
    return this.bookmarksService.findByUuid(id, jobId, user.id);
  }

  @Get('bookmarks')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'List all bookmarks for the current user (paginated)',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiHeader({
    name: 'X-Data-Source',
    required: false,
    description: 'cache | database',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of bookmarks' })
  async getAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: PaginationQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaginatedResult<BookmarkResponseDto>> {
    const { data, source } = await this.bookmarksService.findAll(
      user.id,
      query,
    );
    res.header('X-Data-Source', source);
    return data;
  }
}
