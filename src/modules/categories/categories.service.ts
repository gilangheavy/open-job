import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Category } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CategoryResponseDto } from './dto/category-response.dto';
import type {
  PaginatedResult,
  PaginationQueryDto,
} from '../profile/dto/pagination-query.dto';

const CACHE_TTL = 3600; // 1 hour
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const cacheKey = (uuid: string) => `categories:${uuid}`;

export type FindByUuidResult = {
  data: CategoryResponseDto;
  source: 'cache' | 'database';
};

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async create(dto: CreateCategoryDto): Promise<CategoryResponseDto> {
    const existing = await this.prisma.client.category.findFirst({
      where: { name: dto.name },
    });
    if (existing) {
      throw new ConflictException('Category with this name already exists');
    }

    const category = await this.prisma.client.category.create({
      data: { name: dto.name },
    });
    return this.toResponse(category);
  }

  async findAll(
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<CategoryResponseDto>> {
    const { page, limit } = query;
    const skip = (page - 1) * limit;

    const [categories, total] = await Promise.all([
      this.prisma.client.category.findMany({
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      this.prisma.client.category.count(),
    ]);

    return {
      items: categories.map((c) => this.toResponse(c)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findByUuid(uuid: string): Promise<FindByUuidResult> {
    if (!UUID_REGEX.test(uuid)) {
      throw new NotFoundException('Category not found');
    }

    const cached = await this.cache.get<CategoryResponseDto>(cacheKey(uuid));
    if (cached) return { data: cached, source: 'cache' };

    const category = await this.prisma.client.category.findUnique({
      where: { uuid },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const response = this.toResponse(category);
    await this.cache.set(cacheKey(uuid), response, CACHE_TTL);
    return { data: response, source: 'database' };
  }

  async update(uuid: string, dto: UpdateCategoryDto): Promise<void> {
    const category = await this.findCategoryOrFail(uuid);

    if (dto.name) {
      const conflict = await this.prisma.client.category.findFirst({
        where: { name: dto.name },
      });
      if (conflict && conflict.uuid !== uuid) {
        throw new ConflictException('Category with this name already exists');
      }
    }

    await this.prisma.client.category.update({
      where: { id: category.id },
      data: { name: dto.name },
    });

    await this.invalidateCache(uuid);
  }

  async remove(uuid: string): Promise<void> {
    const category = await this.findCategoryOrFail(uuid);

    await this.prisma.client.category.update({
      where: { id: category.id },
      data: { deletedAt: new Date() },
    });

    await this.invalidateCache(uuid);
  }

  async invalidateCache(uuid: string): Promise<void> {
    await this.cache.del(cacheKey(uuid));
  }

  private async findCategoryOrFail(uuid: string): Promise<Category> {
    if (!UUID_REGEX.test(uuid)) {
      throw new NotFoundException('Category not found');
    }

    const category = await this.prisma.client.category.findUnique({
      where: { uuid },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  private toResponse(category: Category): CategoryResponseDto {
    return {
      id: category.uuid,
      name: category.name,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    };
  }
}
