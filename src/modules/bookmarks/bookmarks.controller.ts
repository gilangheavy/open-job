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

@Controller()
export class BookmarksController {
  constructor(private readonly bookmarksService: BookmarksService) {}

  @Post('jobs/:jobId/bookmark')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
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
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param('jobId') jobId: string,
  ): Promise<{ status: string; message: string }> {
    await this.bookmarksService.remove(user.id, jobId);
    return { status: 'success', message: 'Bookmark deleted successfully' };
  }

  @Get('jobs/:jobId/bookmark/:id')
  @UseGuards(JwtAuthGuard)
  findOne(
    @CurrentUser() user: JwtPayload,
    @Param('jobId') jobId: string,
    @Param('id') id: string,
  ): Promise<BookmarkResponseDto> {
    return this.bookmarksService.findByUuid(id, jobId, user.id);
  }

  @Get('bookmarks')
  @UseGuards(JwtAuthGuard)
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
