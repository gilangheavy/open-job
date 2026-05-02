import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Company, User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { CompanyResponseDto } from './dto/company-response.dto';
import type {
  PaginatedResult,
  PaginationQueryDto,
} from '../profile/dto/pagination-query.dto';

const CACHE_TTL = 3600; // 1 hour
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const cacheKey = (uuid: string) => `companies:${uuid}`;

type CompanyWithOwner = Company & { owner: User };

export type FindByUuidResult = {
  data: CompanyResponseDto;
  source: 'cache' | 'database';
};

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async create(
    userUuid: string,
    dto: CreateCompanyDto,
  ): Promise<CompanyResponseDto> {
    const company = await this.prisma.client.company.create({
      data: {
        name: dto.name,
        description: dto.description ?? '',
        location: dto.location,
        owner: { connect: { uuid: userUuid } },
      },
      include: { owner: true },
    });
    return this.toResponse(company as CompanyWithOwner);
  }

  async findAll(
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<CompanyResponseDto>> {
    const { page, limit } = query;
    const skip = (page - 1) * limit;

    const [companies, total] = await Promise.all([
      this.prisma.client.company.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { owner: true },
      }),
      this.prisma.client.company.count(),
    ]);

    return {
      items: (companies as CompanyWithOwner[]).map((c) => this.toResponse(c)),
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
      throw new NotFoundException('Company not found');
    }

    const cached = await this.cache.get<CompanyResponseDto>(cacheKey(uuid));
    if (cached) return { data: cached, source: 'cache' };

    const company = await this.prisma.client.company.findUnique({
      where: { uuid },
      include: { owner: true },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    const response = this.toResponse(company as CompanyWithOwner);
    await this.cache.set(cacheKey(uuid), response, CACHE_TTL);
    return { data: response, source: 'database' };
  }

  async update(
    uuid: string,
    userUuid: string,
    dto: UpdateCompanyDto,
  ): Promise<void> {
    const company = await this.findCompanyOrFail(uuid);
    this.assertOwnership(company, userUuid);

    await this.prisma.client.company.update({
      where: { id: company.id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.location !== undefined && { location: dto.location }),
      },
    });

    await this.invalidateCache(uuid);
  }

  async remove(uuid: string, userUuid: string): Promise<void> {
    const company = await this.findCompanyOrFail(uuid);
    this.assertOwnership(company, userUuid);

    await this.prisma.client.company.update({
      where: { id: company.id },
      data: { deletedAt: new Date() },
    });

    await this.invalidateCache(uuid);
  }

  async invalidateCache(uuid: string): Promise<void> {
    await this.cache.del(cacheKey(uuid));
  }

  private async findCompanyOrFail(uuid: string): Promise<CompanyWithOwner> {
    if (!UUID_REGEX.test(uuid)) {
      throw new NotFoundException('Company not found');
    }

    const company = await this.prisma.client.company.findUnique({
      where: { uuid },
      include: { owner: true },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    return company as CompanyWithOwner;
  }

  private assertOwnership(
    company: CompanyWithOwner,
    userUuid: string,
  ): void {
    if (company.owner.uuid !== userUuid) {
      throw new ForbiddenException(
        'You do not have permission to modify this company',
      );
    }
  }

  private toResponse(company: CompanyWithOwner): CompanyResponseDto {
    return {
      id: company.uuid,
      name: company.name,
      description: company.description || null,
      location: company.location,
      userId: company.owner.uuid,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
    };
  }
}
