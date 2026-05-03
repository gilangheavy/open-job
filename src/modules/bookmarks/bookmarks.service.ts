import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Bookmark, Job, User } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { BookmarkResponseDto } from './dto/bookmark-response.dto';
import type {
  PaginatedResult,
  PaginationQueryDto,
} from '../profile/dto/pagination-query.dto';

const CACHE_TTL = 3600;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const listCacheKey = (userUuid: string, page: number, limit: number) =>
  `bookmarks:${userUuid}:p${page}:l${limit}`;
const listCachePattern = (userUuid: string) => `bookmarks:${userUuid}:*`;

type BookmarkWithRelations = Bookmark & { user: User; job: Job };

export type FindListResult<T> = {
  data: T;
  source: 'cache' | 'database';
};

@Injectable()
export class BookmarksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async create(
    userUuid: string,
    jobUuid: string,
  ): Promise<BookmarkResponseDto> {
    const job = await this.findJobOrFail(jobUuid);

    const existing = await this.prisma.client.bookmark.findFirst({
      where: {
        user: { uuid: userUuid },
        job: { id: job.id },
      },
    });

    if (existing) {
      throw new ConflictException('You have already bookmarked this job');
    }

    let bookmark: BookmarkWithRelations;
    try {
      bookmark = await this.prisma.client.bookmark.create({
        data: {
          user: { connect: { uuid: userUuid } },
          job: { connect: { id: job.id } },
        },
        include: { user: true, job: true },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('You have already bookmarked this job');
      }
      throw e;
    }

    await this.cache.delPattern(listCachePattern(userUuid));

    return this.toResponse(bookmark);
  }

  async remove(userUuid: string, jobUuid: string): Promise<void> {
    if (!UUID_REGEX.test(jobUuid)) {
      throw new NotFoundException('Job not found');
    }

    const bookmark = await this.prisma.client.bookmark.findFirst({
      where: {
        user: { uuid: userUuid },
        job: { uuid: jobUuid },
      },
      include: { user: true, job: true },
    });

    if (!bookmark) {
      throw new NotFoundException('Bookmark not found');
    }

    if (bookmark.user.uuid !== userUuid) {
      throw new ForbiddenException(
        'You do not have permission to delete this bookmark',
      );
    }

    await this.prisma.client.$executeRaw`
      DELETE FROM bookmarks WHERE id = ${bookmark.id}
    `;

    await this.cache.delPattern(listCachePattern(userUuid));
  }

  async findByUuid(
    uuid: string,
    requesterUuid: string,
  ): Promise<BookmarkResponseDto> {
    if (!UUID_REGEX.test(uuid)) {
      throw new NotFoundException('Bookmark not found');
    }

    const bookmark = await this.prisma.client.bookmark.findUnique({
      where: { uuid },
      include: { user: true, job: true },
    });

    if (!bookmark) {
      throw new NotFoundException('Bookmark not found');
    }

    if (bookmark.user.uuid !== requesterUuid) {
      throw new ForbiddenException(
        'You do not have access to this bookmark',
      );
    }

    return this.toResponse(bookmark as BookmarkWithRelations);
  }

  async findAll(
    userUuid: string,
    query: PaginationQueryDto,
  ): Promise<FindListResult<PaginatedResult<BookmarkResponseDto>>> {
    const { page, limit } = query;
    const key = listCacheKey(userUuid, page, limit);

    const cached =
      await this.cache.get<PaginatedResult<BookmarkResponseDto>>(key);
    if (cached) return { data: cached, source: 'cache' };

    const skip = (page - 1) * limit;

    const [bookmarks, total] = await Promise.all([
      this.prisma.client.bookmark.findMany({
        where: { user: { uuid: userUuid } },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { user: true, job: true },
      }),
      this.prisma.client.bookmark.count({
        where: { user: { uuid: userUuid } },
      }),
    ]);

    const result: PaginatedResult<BookmarkResponseDto> = {
      items: (bookmarks as BookmarkWithRelations[]).map((b) =>
        this.toResponse(b),
      ),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };

    await this.cache.set(key, result, CACHE_TTL);
    return { data: result, source: 'database' };
  }

  private async findJobOrFail(jobUuid: string): Promise<Job> {
    if (!UUID_REGEX.test(jobUuid)) {
      throw new NotFoundException('Job not found');
    }

    const job = await this.prisma.client.job.findUnique({
      where: { uuid: jobUuid },
    });

    if (!job || job.deletedAt !== null) {
      throw new NotFoundException('Job not found');
    }

    return job;
  }

  private toResponse(bookmark: BookmarkWithRelations): BookmarkResponseDto {
    return {
      id: bookmark.uuid,
      jobId: bookmark.job.uuid,
      userId: bookmark.user.uuid,
      createdAt: bookmark.createdAt,
      updatedAt: bookmark.updatedAt,
    };
  }
}

