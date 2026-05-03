import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { JobResponseDto } from './dto/job-response.dto';

const OWNER_UUID = '111e8400-e29b-41d4-a716-446655440001';
const COMPANY_UUID = '550e8400-e29b-41d4-a716-446655440000';
const CATEGORY_UUID = '660e8400-e29b-41d4-a716-446655440002';
const JOB_UUID = '770e8400-e29b-41d4-a716-446655440003';
const OTHER_UUID = '999e8400-e29b-41d4-a716-446655440099';

const mockOwner = {
  id: 1,
  uuid: OWNER_UUID,
  fullname: 'Job Owner',
  email: 'owner@example.com',
  password: 'hashed',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  deletedAt: null,
};

const mockCompany = {
  id: 1,
  uuid: COMPANY_UUID,
  name: 'Test Company',
  description: 'A test company',
  location: 'Jakarta',
  userId: 1,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  deletedAt: null,
  owner: mockOwner,
};

const mockCategory = {
  id: 1,
  uuid: CATEGORY_UUID,
  name: 'Engineering',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  deletedAt: null,
};

const mockJob = {
  id: 1,
  uuid: JOB_UUID,
  companyId: 1,
  categoryId: 1,
  title: 'Software Engineer',
  description: 'A great job',
  location: 'Remote',
  salary: 10000000,
  type: 'Full-time',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  deletedAt: null,
  company: mockCompany,
  category: mockCategory,
};

const mockJobResponse: JobResponseDto = {
  id: JOB_UUID,
  title: 'Software Engineer',
  description: 'A great job',
  location: 'Remote',
  salary: 10000000,
  type: 'Full-time',
  company: {
    id: COMPANY_UUID,
    name: 'Test Company',
    description: 'A test company',
    location: 'Jakarta',
    userId: OWNER_UUID,
    createdAt: mockCompany.createdAt,
    updatedAt: mockCompany.updatedAt,
  },
  category: {
    id: CATEGORY_UUID,
    name: 'Engineering',
    createdAt: mockCategory.createdAt,
    updatedAt: mockCategory.updatedAt,
  },
  createdAt: mockJob.createdAt,
  updatedAt: mockJob.updatedAt,
};

describe('JobsService', () => {
  let service: JobsService;
  let prisma: {
    client: {
      job: {
        findMany: jest.Mock;
        count: jest.Mock;
        findUnique: jest.Mock;
        create: jest.Mock;
        update: jest.Mock;
        delete: jest.Mock;
      };
      company: {
        findUnique: jest.Mock;
      };
      category: {
        findUnique: jest.Mock;
      };
    };
  };
  let cache: jest.Mocked<CacheService>;

  beforeEach(async () => {
    prisma = {
      client: {
        job: {
          findMany: jest.fn(),
          count: jest.fn(),
          findUnique: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
          delete: jest.fn(),
        },
        company: {
          findUnique: jest.fn(),
        },
        category: {
          findUnique: jest.fn(),
        },
      },
    };

    cache = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    } as unknown as jest.Mocked<CacheService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheService, useValue: cache },
      ],
    }).compile();

    service = module.get<JobsService>(JobsService);
  });

  afterEach(() => jest.clearAllMocks());

  // -----------------------------------------------------------------------
  // create()
  // -----------------------------------------------------------------------
  describe('create()', () => {
    const dto: CreateJobDto = {
      companyId: COMPANY_UUID,
      categoryId: CATEGORY_UUID,
      title: 'Software Engineer',
      description: 'A great job',
      location: 'Remote',
      salary: 10000000,
      type: 'Full-time',
    };

    it('should create a job and return JobResponseDto', async () => {
      prisma.client.company.findUnique.mockResolvedValue(mockCompany);
      prisma.client.category.findUnique.mockResolvedValue(mockCategory);
      prisma.client.job.create.mockResolvedValue(mockJob);

      const result = await service.create(OWNER_UUID, dto);

      expect(prisma.client.company.findUnique).toHaveBeenCalledWith({
        where: { uuid: COMPANY_UUID },
        include: { owner: true },
      });
      expect(prisma.client.category.findUnique).toHaveBeenCalledWith({
        where: { uuid: CATEGORY_UUID },
      });
      expect(prisma.client.job.create).toHaveBeenCalledWith({
        data: {
          title: dto.title,
          description: dto.description ?? '',
          location: dto.location ?? '',
          salary: dto.salary,
          type: dto.type,
          company: { connect: { id: mockCompany.id } },
          category: { connect: { id: mockCategory.id } },
        },
        include: {
          company: { include: { owner: true } },
          category: true,
        },
      });
      expect(result).toEqual(mockJobResponse);
    });

    it('should throw NotFoundException if company does not exist', async () => {
      prisma.client.company.findUnique.mockResolvedValue(null);

      await expect(service.create(OWNER_UUID, dto)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.client.job.create).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException if user does not own the company', async () => {
      prisma.client.company.findUnique.mockResolvedValue(mockCompany);

      await expect(service.create(OTHER_UUID, dto)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.client.job.create).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if category does not exist', async () => {
      prisma.client.company.findUnique.mockResolvedValue(mockCompany);
      prisma.client.category.findUnique.mockResolvedValue(null);

      await expect(service.create(OWNER_UUID, dto)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.client.job.create).not.toHaveBeenCalled();
    });

    it('should not expose integer id or deletedAt in response', async () => {
      prisma.client.company.findUnique.mockResolvedValue(mockCompany);
      prisma.client.category.findUnique.mockResolvedValue(mockCategory);
      prisma.client.job.create.mockResolvedValue(mockJob);

      const result = await service.create(OWNER_UUID, dto);

      expect(result.id).toBe(JOB_UUID);
      expect(result).not.toHaveProperty('deletedAt');
      expect(typeof result.id).toBe('string');
    });

    it('should store null when description is not provided', async () => {
      const dtoWithoutDesc: CreateJobDto = {
        companyId: COMPANY_UUID,
        categoryId: CATEGORY_UUID,
        title: 'Engineer',
        type: 'Part-time',
      };
      prisma.client.company.findUnique.mockResolvedValue(mockCompany);
      prisma.client.category.findUnique.mockResolvedValue(mockCategory);
      prisma.client.job.create.mockResolvedValue({
        ...mockJob,
        description: '',
        location: '',
        salary: null,
      });

      const result = await service.create(OWNER_UUID, dtoWithoutDesc);

      expect(prisma.client.job.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ description: '', location: '' }),
        }),
      );
      expect(result.description).toBeNull();
      expect(result.location).toBeNull();
      expect(result.salary).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // findAll()
  // -----------------------------------------------------------------------
  describe('findAll()', () => {
    it('should return a paginated list of jobs', async () => {
      prisma.client.job.findMany.mockResolvedValue([mockJob]);
      prisma.client.job.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(prisma.client.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            company: { include: { owner: true } },
            category: true,
          },
        }),
      );
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual(mockJobResponse);
    });

    it('should return correct pagination meta', async () => {
      prisma.client.job.findMany.mockResolvedValue([mockJob]);
      prisma.client.job.count.mockResolvedValue(25);

      const result = await service.findAll({ page: 2, limit: 10 });

      expect(result.meta).toEqual({
        total: 25,
        page: 2,
        limit: 10,
        totalPages: 3,
      });
    });

    it('should apply title filter (case-insensitive ilike)', async () => {
      prisma.client.job.findMany.mockResolvedValue([mockJob]);
      prisma.client.job.count.mockResolvedValue(1);

      await service.findAll({ page: 1, limit: 10, title: 'engineer' });

      expect(prisma.client.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            title: { contains: 'engineer', mode: 'insensitive' },
          }),
        }),
      );
    });

    it('should apply company-name filter (case-insensitive ilike)', async () => {
      prisma.client.job.findMany.mockResolvedValue([mockJob]);
      prisma.client.job.count.mockResolvedValue(1);

      await service.findAll({ page: 1, limit: 10, companyName: 'acme' });

      expect(prisma.client.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            company: { name: { contains: 'acme', mode: 'insensitive' } },
          }),
        }),
      );
    });

    it('should apply both title and company-name filters simultaneously', async () => {
      prisma.client.job.findMany.mockResolvedValue([]);
      prisma.client.job.count.mockResolvedValue(0);

      await service.findAll({
        page: 1,
        limit: 10,
        title: 'engineer',
        companyName: 'acme',
      });

      expect(prisma.client.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            title: { contains: 'engineer', mode: 'insensitive' },
            company: { name: { contains: 'acme', mode: 'insensitive' } },
          }),
        }),
      );
    });

    it('should return empty items and total=0 when no jobs exist', async () => {
      prisma.client.job.findMany.mockResolvedValue([]);
      prisma.client.job.count.mockResolvedValue(0);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result.items).toHaveLength(0);
      expect(result.meta.total).toBe(0);
      expect(result.meta.totalPages).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // findByUuid()
  // -----------------------------------------------------------------------
  describe('findByUuid()', () => {
    it('should return cached job if present in Redis', async () => {
      cache.get.mockResolvedValue(mockJobResponse);

      const result = await service.findByUuid(JOB_UUID);

      expect(cache.get).toHaveBeenCalledWith(`jobs:${JOB_UUID}`);
      expect(prisma.client.job.findUnique).not.toHaveBeenCalled();
      expect(result.data).toEqual(mockJobResponse);
      expect(result.source).toBe('cache');
    });

    it('should fetch from DB and cache result on cache miss', async () => {
      cache.get.mockResolvedValue(null);
      prisma.client.job.findUnique.mockResolvedValue(mockJob);
      cache.set.mockResolvedValue(undefined);

      const result = await service.findByUuid(JOB_UUID);

      expect(prisma.client.job.findUnique).toHaveBeenCalledWith({
        where: { uuid: JOB_UUID },
        include: {
          company: { include: { owner: true } },
          category: true,
        },
      });
      expect(cache.set).toHaveBeenCalledWith(
        `jobs:${JOB_UUID}`,
        mockJobResponse,
        3600,
      );
      expect(result.data).toEqual(mockJobResponse);
      expect(result.source).toBe('database');
    });

    it('should throw NotFoundException when job not found in DB', async () => {
      cache.get.mockResolvedValue(null);
      prisma.client.job.findUnique.mockResolvedValue(null);

      await expect(service.findByUuid(JOB_UUID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should not expose integer id or deletedAt in result', async () => {
      cache.get.mockResolvedValue(null);
      prisma.client.job.findUnique.mockResolvedValue(mockJob);

      const result = await service.findByUuid(JOB_UUID);

      expect(result.data.id).toBe(JOB_UUID);
      expect(result.data).not.toHaveProperty('deletedAt');
    });
  });

  // -----------------------------------------------------------------------
  // findByCompany()
  // -----------------------------------------------------------------------
  describe('findByCompany()', () => {
    it('should return paginated jobs for a given company UUID', async () => {
      prisma.client.company.findUnique.mockResolvedValue(mockCompany);
      prisma.client.job.findMany.mockResolvedValue([mockJob]);
      prisma.client.job.count.mockResolvedValue(1);

      const result = await service.findByCompany(COMPANY_UUID, {
        page: 1,
        limit: 10,
      });

      expect(prisma.client.company.findUnique).toHaveBeenCalledWith({
        where: { uuid: COMPANY_UUID },
      });
      expect(prisma.client.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: mockCompany.id },
          skip: 0,
          take: 10,
        }),
      );
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual(mockJobResponse);
    });

    it('should throw NotFoundException when company not found', async () => {
      prisma.client.company.findUnique.mockResolvedValue(null);

      await expect(
        service.findByCompany(COMPANY_UUID, { page: 1, limit: 10 }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.client.job.findMany).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // findByCategory()
  // -----------------------------------------------------------------------
  describe('findByCategory()', () => {
    it('should return paginated jobs for a given category UUID', async () => {
      prisma.client.category.findUnique.mockResolvedValue(mockCategory);
      prisma.client.job.findMany.mockResolvedValue([mockJob]);
      prisma.client.job.count.mockResolvedValue(1);

      const result = await service.findByCategory(CATEGORY_UUID, {
        page: 1,
        limit: 10,
      });

      expect(prisma.client.category.findUnique).toHaveBeenCalledWith({
        where: { uuid: CATEGORY_UUID },
      });
      expect(prisma.client.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { categoryId: mockCategory.id },
          skip: 0,
          take: 10,
        }),
      );
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual(mockJobResponse);
    });

    it('should throw NotFoundException when category not found', async () => {
      prisma.client.category.findUnique.mockResolvedValue(null);

      await expect(
        service.findByCategory(CATEGORY_UUID, { page: 1, limit: 10 }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.client.job.findMany).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // update()
  // -----------------------------------------------------------------------
  describe('update()', () => {
    const dto: UpdateJobDto = { title: 'Senior Engineer', location: 'Bandung' };

    it('should update the job and invalidate cache', async () => {
      prisma.client.job.findUnique.mockResolvedValue(mockJob);
      prisma.client.job.update.mockResolvedValue({
        ...mockJob,
        title: 'Senior Engineer',
        location: 'Bandung',
      });
      cache.del.mockResolvedValue(undefined);

      await service.update(JOB_UUID, OWNER_UUID, dto);

      expect(prisma.client.job.update).toHaveBeenCalledWith({
        where: { id: mockJob.id },
        data: expect.objectContaining({
          title: 'Senior Engineer',
          location: 'Bandung',
        }),
      });
      expect(cache.del).toHaveBeenCalledWith(`jobs:${JOB_UUID}`);
    });

    it('should throw NotFoundException when job not found', async () => {
      prisma.client.job.findUnique.mockResolvedValue(null);

      await expect(service.update(JOB_UUID, OWNER_UUID, dto)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.client.job.update).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when user is not the company owner', async () => {
      prisma.client.job.findUnique.mockResolvedValue(mockJob);

      await expect(service.update(JOB_UUID, OTHER_UUID, dto)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.client.job.update).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // remove()
  // -----------------------------------------------------------------------
  describe('remove()', () => {
    it('should soft delete the job and invalidate cache', async () => {
      prisma.client.job.findUnique.mockResolvedValue(mockJob);
      prisma.client.job.delete.mockResolvedValue(mockJob);
      cache.del.mockResolvedValue(undefined);

      await service.remove(JOB_UUID, OWNER_UUID);

      expect(prisma.client.job.delete).toHaveBeenCalledWith({
        where: { id: mockJob.id },
      });
      expect(cache.del).toHaveBeenCalledWith(`jobs:${JOB_UUID}`);
    });

    it('should throw NotFoundException when job not found', async () => {
      prisma.client.job.findUnique.mockResolvedValue(null);

      await expect(service.remove(JOB_UUID, OWNER_UUID)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.client.job.delete).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when user is not the company owner', async () => {
      prisma.client.job.findUnique.mockResolvedValue(mockJob);

      await expect(service.remove(JOB_UUID, OTHER_UUID)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.client.job.delete).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // invalidateCache()
  // -----------------------------------------------------------------------
  describe('invalidateCache()', () => {
    it('should delete the cache key for the given uuid', async () => {
      cache.del.mockResolvedValue(undefined);

      await service.invalidateCache(JOB_UUID);

      expect(cache.del).toHaveBeenCalledWith(`jobs:${JOB_UUID}`);
    });
  });
});
