import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Application, Job, Company, User } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { QueueService } from '../queue/queue.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationStatusDto } from './dto/update-application-status.dto';
import { ApplicationResponseDto } from './dto/application-response.dto';
import type {
  PaginatedResult,
  PaginationQueryDto,
} from '../profile/dto/pagination-query.dto';

const CACHE_TTL = 3600;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const cacheKey = (uuid: string) => `applications:${uuid}`;
const userCacheKey = (userUuid: string, page: number, limit: number) =>
  `applications:user:${userUuid}:p${page}:l${limit}`;
const jobCacheKey = (jobUuid: string, page: number, limit: number) =>
  `applications:job:${jobUuid}:p${page}:l${limit}`;

/** Wildcard patterns for invalidating all paginated pages of a list. */
const userCachePattern = (userUuid: string) =>
  `applications:user:${userUuid}:*`;
const jobCachePattern = (jobUuid: string) => `applications:job:${jobUuid}:*`;

type CompanyWithOwner = Company & { owner: User };
type JobWithCompany = Job & { company: CompanyWithOwner };
type ApplicationWithRelations = Application & {
  user: User;
  job: JobWithCompany;
};

export type FindByUuidResult = {
  data: ApplicationResponseDto;
  source: 'cache' | 'database';
};

export type FindListResult<T> = {
  data: T;
  source: 'cache' | 'database';
};

/**
 * Internal Redis entry for single-record cache.
 * Extends the public DTO with `_ownerUuid` so both the applicant
 * AND the company owner can be authorized from cached data alone.
 * `_ownerUuid` is never returned to the client.
 */
type CachedApplicationEntry = ApplicationResponseDto & { _ownerUuid: string };

/**
 * Valid status transitions for the application state machine.
 * pending → accepted ✓
 * pending → rejected ✓
 * accepted → rejected ✓
 * rejected → accepted ✓
 * * → pending ✗ (always invalid)
 */
function assertValidTransition(from: string, to: string): void {
  if (to === 'pending') {
    throw new UnprocessableEntityException(
      `Status transition from '${from}' to '${to}' is not allowed`,
    );
  }
}

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly queue: QueueService,
  ) {}

  async create(
    userUuid: string,
    dto: CreateApplicationDto,
  ): Promise<ApplicationResponseDto> {
    const job = await this.findJobOrFail(dto.jobId);

    if (job.company.owner.uuid === userUuid) {
      throw new ForbiddenException(
        'You cannot apply to a job at your own company',
      );
    }

    const existing = await this.prisma.client.application.findFirst({
      where: {
        user: { uuid: userUuid },
        job: { uuid: dto.jobId },
      },
    });

    if (existing) {
      throw new ConflictException('You have already applied to this job');
    }

    let application: ApplicationWithRelations;
    try {
      application = await this.prisma.client.application.create({
        data: {
          status: 'pending',
          user: { connect: { uuid: userUuid } },
          job: { connect: { id: job.id } },
        },
        include: {
          user: true,
          job: { include: { company: { include: { owner: true } } } },
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('You have already applied to this job');
      }
      throw e;
    }

    // Fire-and-forget: publish to RabbitMQ (non-blocking)
    this.queue.publish('application.created', {
      applicationId: application.uuid,
    });

    // Invalidate all paginated list caches for this user and job
    await Promise.all([
      this.cache.delPattern(userCachePattern(userUuid)),
      this.cache.delPattern(jobCachePattern(job.uuid)),
    ]);

    return this.toResponse(application);
  }

  async findAll(
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<ApplicationResponseDto>> {
    const { page, limit } = query;
    const skip = (page - 1) * limit;

    const [applications, total] = await Promise.all([
      this.prisma.client.application.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: true,
          job: { include: { company: { include: { owner: true } } } },
        },
      }),
      this.prisma.client.application.count(),
    ]);

    return {
      items: (applications as ApplicationWithRelations[]).map((a) =>
        this.toResponse(a),
      ),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findByUuid(
    uuid: string,
    requesterUuid: string,
  ): Promise<FindByUuidResult> {
    if (!UUID_REGEX.test(uuid)) {
      throw new NotFoundException('Application not found');
    }

    const cached = await this.cache.get<CachedApplicationEntry>(cacheKey(uuid));
    if (cached) {
      const { _ownerUuid, ...data } = cached;
      const isApplicant = data.userId === requesterUuid;
      const isOwner = _ownerUuid === requesterUuid;
      if (!isApplicant && !isOwner) {
        throw new ForbiddenException(
          'You do not have access to this application',
        );
      }
      return { data, source: 'cache' };
    }

    const application = await this.prisma.client.application.findUnique({
      where: { uuid },
      include: {
        user: true,
        job: { include: { company: { include: { owner: true } } } },
      },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    this.assertCanReadFull(application, requesterUuid);

    const response = this.toResponse(application);
    // Store with owner UUID for authorization on cache hits
    const entry: CachedApplicationEntry = {
      ...response,
      _ownerUuid: application.job.company.owner.uuid,
    };
    await this.cache.set(cacheKey(uuid), entry, CACHE_TTL);
    return { data: response, source: 'database' };
  }

  async findByUser(
    targetUserUuid: string,
    requesterUuid: string,
    query: PaginationQueryDto,
  ): Promise<FindListResult<PaginatedResult<ApplicationResponseDto>>> {
    if (!UUID_REGEX.test(targetUserUuid)) {
      throw new NotFoundException('User not found');
    }

    if (targetUserUuid !== requesterUuid) {
      throw new ForbiddenException('You can only view your own applications');
    }

    const { page, limit } = query;
    const cached = await this.cache.get<PaginatedResult<ApplicationResponseDto>>(
      userCacheKey(targetUserUuid, page, limit),
    );
    if (cached) return { data: cached, source: 'cache' };

    const user = await this.prisma.client.user.findUnique({
      where: { uuid: targetUserUuid },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const skip = (page - 1) * limit;

    const [applications, total] = await Promise.all([
      this.prisma.client.application.findMany({
        where: { user: { uuid: targetUserUuid } },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: true,
          job: { include: { company: { include: { owner: true } } } },
        },
      }),
      this.prisma.client.application.count({
        where: { user: { uuid: targetUserUuid } },
      }),
    ]);

    const result: PaginatedResult<ApplicationResponseDto> = {
      items: (applications as ApplicationWithRelations[]).map((a) =>
        this.toResponse(a),
      ),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };

    await this.cache.set(
      userCacheKey(targetUserUuid, page, limit),
      result,
      CACHE_TTL,
    );
    return { data: result, source: 'database' };
  }

  async findByJob(
    jobUuid: string,
    requesterUuid: string,
    query: PaginationQueryDto,
  ): Promise<FindListResult<PaginatedResult<ApplicationResponseDto>>> {
    if (!UUID_REGEX.test(jobUuid)) {
      throw new NotFoundException('Job not found');
    }

    // Authorization MUST happen before any cache read to prevent IDOR:
    // a cached response must never be served to an unauthorized requester.
    const job = await this.prisma.client.job.findUnique({
      where: { uuid: jobUuid },
      include: { company: { include: { owner: true } } },
    });
    if (!job) {
      throw new NotFoundException('Job not found');
    }
    if (job.company.owner.uuid !== requesterUuid) {
      throw new ForbiddenException(
        'Only the company owner can view job applications',
      );
    }

    const { page, limit } = query;
    const cached = await this.cache.get<PaginatedResult<ApplicationResponseDto>>(
      jobCacheKey(jobUuid, page, limit),
    );
    if (cached) return { data: cached, source: 'cache' };
    const skip = (page - 1) * limit;

    const [applications, total] = await Promise.all([
      this.prisma.client.application.findMany({
        where: { job: { uuid: jobUuid } },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: true,
          job: { include: { company: { include: { owner: true } } } },
        },
      }),
      this.prisma.client.application.count({
        where: { job: { uuid: jobUuid } },
      }),
    ]);

    const result: PaginatedResult<ApplicationResponseDto> = {
      items: (applications as ApplicationWithRelations[]).map((a) =>
        this.toResponse(a),
      ),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };

    await this.cache.set(
      jobCacheKey(jobUuid, page, limit),
      result,
      CACHE_TTL,
    );
    return { data: result, source: 'database' };
  }

  async updateStatus(
    uuid: string,
    requesterUuid: string,
    dto: UpdateApplicationStatusDto,
  ): Promise<void> {
    const application = await this.findApplicationOrFail(uuid);

    const jobWithCompany = application.job;
    if (jobWithCompany.company.owner.uuid !== requesterUuid) {
      throw new ForbiddenException(
        'Only the company owner can update application status',
      );
    }

    assertValidTransition(application.status, dto.status);

    await this.prisma.client.application.update({
      where: { id: application.id },
      data: { status: dto.status },
    });

    await this.invalidateCaches(
      uuid,
      application.user.uuid,
      application.job.uuid,
    );
  }

  async remove(uuid: string, requesterUuid: string): Promise<void> {
    if (!UUID_REGEX.test(uuid)) {
      throw new NotFoundException('Application not found');
    }

    const application = await this.findApplicationOrFail(uuid);

    if (application.user.uuid !== requesterUuid) {
      throw new ForbiddenException(
        'Only the applicant can delete their application',
      );
    }

    // Hard delete — bypass soft-delete extension via raw SQL
    await this.prisma.client.$executeRaw`
      DELETE FROM applications WHERE id = ${application.id}
    `;

    await this.invalidateCaches(
      uuid,
      application.user.uuid,
      application.job.uuid,
    );
  }

  async invalidateCaches(
    applicationUuid: string,
    userUuid: string,
    jobUuid: string,
  ): Promise<void> {
    await Promise.all([
      this.cache.del(cacheKey(applicationUuid)),
      this.cache.delPattern(userCachePattern(userUuid)),
      this.cache.delPattern(jobCachePattern(jobUuid)),
    ]);
  }

  private async findJobOrFail(jobUuid: string): Promise<JobWithCompany> {
    if (!UUID_REGEX.test(jobUuid)) {
      throw new NotFoundException('Job not found');
    }

    const job = await this.prisma.client.job.findUnique({
      where: { uuid: jobUuid },
      include: { company: { include: { owner: true } } },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    return job;
  }

  private async findApplicationOrFail(
    uuid: string,
  ): Promise<ApplicationWithRelations> {
    if (!UUID_REGEX.test(uuid)) {
      throw new NotFoundException('Application not found');
    }

    const application = await this.prisma.client.application.findUnique({
      where: { uuid },
      include: {
        user: true,
        job: { include: { company: { include: { owner: true } } } },
      },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    return application;
  }

  /** Full permission check using the complete Prisma record. */
  private assertCanReadFull(
    application: ApplicationWithRelations,
    requesterUuid: string,
  ): void {
    const isApplicant = application.user.uuid === requesterUuid;
    const isCompanyOwner = application.job.company.owner.uuid === requesterUuid;

    if (!isApplicant && !isCompanyOwner) {
      throw new ForbiddenException(
        'You do not have access to this application',
      );
    }
  }

  private toResponse(
    application: ApplicationWithRelations,
  ): ApplicationResponseDto {
    return {
      id: application.uuid,
      jobId: application.job.uuid,
      userId: application.user.uuid,
      status: application.status,
      createdAt: application.createdAt,
      updatedAt: application.updatedAt,
    };
  }
}
