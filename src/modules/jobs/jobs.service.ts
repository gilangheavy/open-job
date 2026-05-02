import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Category, Company, Job, User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { JobResponseDto } from './dto/job-response.dto';
import { JobQueryDto } from './dto/job-query.dto';
import type { CompanyResponseDto } from '../companies/dto/company-response.dto';
import type { CategoryResponseDto } from '../categories/dto/category-response.dto';
import type {
  PaginatedResult,
  PaginationQueryDto,
} from '../profile/dto/pagination-query.dto';

const CACHE_TTL = 3600; // 1 hour
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const cacheKey = (uuid: string) => `jobs:${uuid}`;

type CompanyWithOwner = Company & { owner: User };
type JobWithRelations = Job & {
  company: CompanyWithOwner;
  category: Category;
};

export type FindByUuidResult = {
  data: JobResponseDto;
  source: 'cache' | 'database';
};

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async create(userUuid: string, dto: CreateJobDto): Promise<JobResponseDto> {
    const company = await this.prisma.client.company.findUnique({
      where: { uuid: dto.companyId },
      include: { owner: true },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    if (company.owner.uuid !== userUuid) {
      throw new ForbiddenException(
        'You do not have permission to post jobs for this company',
      );
    }

    const category = await this.prisma.client.category.findUnique({
      where: { uuid: dto.categoryId },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const job = await this.prisma.client.job.create({
      data: {
        title: dto.title,
        description: dto.description ?? '',
        location: dto.location ?? '',
        salary: dto.salary !== undefined ? dto.salary : null,
        type: dto.type,
        company: { connect: { id: company.id } },
        category: { connect: { id: category.id } },
      },
      include: {
        company: { include: { owner: true } },
        category: true,
      },
    });

    return this.toResponse(job);
  }

  async findAll(query: JobQueryDto): Promise<PaginatedResult<JobResponseDto>> {
    const { page, limit } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (query.title) {
      where.title = { contains: query.title, mode: 'insensitive' };
    }
    if (query.companyName) {
      where.company = {
        name: { contains: query.companyName, mode: 'insensitive' },
      };
    }

    const [jobs, total] = await Promise.all([
      this.prisma.client.job.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          company: { include: { owner: true } },
          category: true,
        },
      }),
      this.prisma.client.job.count({ where }),
    ]);

    return {
      items: (jobs as JobWithRelations[]).map((j) => this.toResponse(j)),
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
      throw new NotFoundException('Job not found');
    }

    const cached = await this.cache.get<JobResponseDto>(cacheKey(uuid));
    if (cached) return { data: cached, source: 'cache' };

    const job = await this.prisma.client.job.findUnique({
      where: { uuid },
      include: {
        company: { include: { owner: true } },
        category: true,
      },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    const response = this.toResponse(job);
    await this.cache.set(cacheKey(uuid), response, CACHE_TTL);
    return { data: response, source: 'database' };
  }

  async findByCompany(
    companyUuid: string,
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<JobResponseDto>> {
    if (!UUID_REGEX.test(companyUuid)) {
      throw new NotFoundException('Company not found');
    }

    const company = await this.prisma.client.company.findUnique({
      where: { uuid: companyUuid },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    const { page, limit } = query;
    const skip = (page - 1) * limit;
    const where = { companyId: company.id };

    const [jobs, total] = await Promise.all([
      this.prisma.client.job.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          company: { include: { owner: true } },
          category: true,
        },
      }),
      this.prisma.client.job.count({ where }),
    ]);

    return {
      items: (jobs as JobWithRelations[]).map((j) => this.toResponse(j)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findByCategory(
    categoryUuid: string,
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<JobResponseDto>> {
    if (!UUID_REGEX.test(categoryUuid)) {
      throw new NotFoundException('Category not found');
    }

    const category = await this.prisma.client.category.findUnique({
      where: { uuid: categoryUuid },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const { page, limit } = query;
    const skip = (page - 1) * limit;
    const where = { categoryId: category.id };

    const [jobs, total] = await Promise.all([
      this.prisma.client.job.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          company: { include: { owner: true } },
          category: true,
        },
      }),
      this.prisma.client.job.count({ where }),
    ]);

    return {
      items: (jobs as JobWithRelations[]).map((j) => this.toResponse(j)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async update(
    uuid: string,
    userUuid: string,
    dto: UpdateJobDto,
  ): Promise<void> {
    const job = await this.findJobOrFail(uuid);
    this.assertOwnership(job, userUuid);

    await this.prisma.client.job.update({
      where: { id: job.id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.location !== undefined && { location: dto.location }),
        ...(dto.salary !== undefined && { salary: dto.salary }),
        ...(dto.type !== undefined && { type: dto.type }),
      },
    });

    await this.invalidateCache(uuid);
  }

  async remove(uuid: string, userUuid: string): Promise<void> {
    const job = await this.findJobOrFail(uuid);
    this.assertOwnership(job, userUuid);

    await this.prisma.client.job.update({
      where: { id: job.id },
      data: { deletedAt: new Date() },
    });

    await this.invalidateCache(uuid);
  }

  async invalidateCache(uuid: string): Promise<void> {
    await this.cache.del(cacheKey(uuid));
  }

  private async findJobOrFail(uuid: string): Promise<JobWithRelations> {
    if (!UUID_REGEX.test(uuid)) {
      throw new NotFoundException('Job not found');
    }

    const job = await this.prisma.client.job.findUnique({
      where: { uuid },
      include: {
        company: { include: { owner: true } },
        category: true,
      },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    return job;
  }

  private assertOwnership(job: JobWithRelations, userUuid: string): void {
    if (job.company.owner.uuid !== userUuid) {
      throw new ForbiddenException(
        'You do not have permission to modify this job',
      );
    }
  }

  private toResponse(job: JobWithRelations): JobResponseDto {
    const company: CompanyResponseDto = {
      id: job.company.uuid,
      name: job.company.name,
      description: job.company.description || null,
      location: job.company.location,
      userId: job.company.owner.uuid,
      createdAt: job.company.createdAt,
      updatedAt: job.company.updatedAt,
    };

    const category: CategoryResponseDto = {
      id: job.category.uuid,
      name: job.category.name,
      createdAt: job.category.createdAt,
      updatedAt: job.category.updatedAt,
    };

    return {
      id: job.uuid,
      title: job.title,
      description: job.description || null,
      location: job.location || null,
      salary: job.salary !== null ? Number(job.salary) : null,
      type: job.type,
      company,
      category,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }
}
