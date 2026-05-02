import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { UserResponseDto } from '../users/dto/user-response.dto';
import {
  PaginatedResult,
  PaginationQueryDto,
} from './dto/pagination-query.dto';
import { ProfileApplicationResponseDto } from './dto/profile-application-response.dto';
import { ProfileBookmarkResponseDto } from './dto/profile-bookmark-response.dto';

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  async getProfile(uuid: string): Promise<UserResponseDto> {
    const { data } = await this.usersService.findByUuid(uuid);
    return data;
  }

  async getApplications(
    uuid: string,
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<ProfileApplicationResponseDto>> {
    const { page, limit } = query;
    const skip = (page - 1) * limit;
    const where = { user: { uuid } };

    const [items, total] = await Promise.all([
      this.prisma.client.application.findMany({
        where,
        skip,
        take: limit,
        include: {
          job: {
            select: {
              uuid: true,
              title: true,
              location: true,
              type: true,
              salary: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.client.application.count({ where }),
    ]);

    return {
      items: items.map((app) => ({
        id: app.uuid,
        status: app.status,
        createdAt: app.createdAt,
        job: {
          id: app.job.uuid,
          title: app.job.title,
          location: app.job.location,
          type: app.job.type,
          salary: app.job.salary?.toString() ?? null,
        },
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getBookmarks(
    uuid: string,
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<ProfileBookmarkResponseDto>> {
    const { page, limit } = query;
    const skip = (page - 1) * limit;
    const where = { user: { uuid } };

    const [items, total] = await Promise.all([
      this.prisma.client.bookmark.findMany({
        where,
        skip,
        take: limit,
        include: {
          job: {
            select: {
              uuid: true,
              title: true,
              location: true,
              type: true,
              salary: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.client.bookmark.count({ where }),
    ]);

    return {
      items: items.map((bm) => ({
        id: bm.uuid,
        createdAt: bm.createdAt,
        job: {
          id: bm.job.uuid,
          title: bm.job.title,
          location: bm.job.location,
          type: bm.job.type,
          salary: bm.job.salary?.toString() ?? null,
        },
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
