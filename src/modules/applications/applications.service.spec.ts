import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { QueueService } from '../queue/queue.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationStatusDto } from './dto/update-application-status.dto';
import { ApplicationResponseDto } from './dto/application-response.dto';

const APPLICANT_UUID = '111e8400-e29b-41d4-a716-446655440001';
const OWNER_UUID = '222e8400-e29b-41d4-a716-446655440002';
const JOB_UUID = '330e8400-e29b-41d4-a716-446655440003';
const COMPANY_UUID = '440e8400-e29b-41d4-a716-446655440004';
const APPLICATION_UUID = '550e8400-e29b-41d4-a716-446655440005';
const OTHER_UUID = '999e8400-e29b-41d4-a716-446655440099';

const mockApplicant = {
  id: 1,
  uuid: APPLICANT_UUID,
  fullname: 'Applicant User',
  email: 'applicant@example.com',
  password: 'hashed',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  deletedAt: null,
};

const mockOwner = {
  id: 2,
  uuid: OWNER_UUID,
  fullname: 'Company Owner',
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
  userId: 2,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  deletedAt: null,
  owner: mockOwner,
};

const mockJob = {
  id: 1,
  uuid: JOB_UUID,
  companyId: 1,
  categoryId: 1,
  title: 'Software Engineer',
  description: 'Build great things',
  location: 'Remote',
  salary: 10000000,
  type: 'Full-time',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  deletedAt: null,
  company: mockCompany,
};

const mockApplication = {
  id: 1,
  uuid: APPLICATION_UUID,
  userId: 1,
  jobId: 1,
  status: 'pending',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  deletedAt: null,
  user: mockApplicant,
  job: mockJob,
};

const mockApplicationResponse: ApplicationResponseDto = {
  id: APPLICATION_UUID,
  jobId: JOB_UUID,
  userId: APPLICANT_UUID,
  status: 'pending',
  createdAt: mockApplication.createdAt,
  updatedAt: mockApplication.updatedAt,
};

describe('ApplicationsService', () => {
  let service: ApplicationsService;
  let prisma: {
    client: {
      application: {
        findMany: jest.Mock;
        count: jest.Mock;
        findUnique: jest.Mock;
        findFirst: jest.Mock;
        create: jest.Mock;
        update: jest.Mock;
        delete: jest.Mock;
      };
      job: {
        findUnique: jest.Mock;
      };
      user: {
        findUnique: jest.Mock;
      };
      $executeRaw: jest.Mock;
    };
  };
  let cache: jest.Mocked<CacheService>;
  let queue: jest.Mocked<QueueService>;

  beforeEach(async () => {
    prisma = {
      client: {
        application: {
          findMany: jest.fn(),
          count: jest.fn(),
          findUnique: jest.fn(),
          findFirst: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
          delete: jest.fn(),
        },
        job: {
          findUnique: jest.fn(),
        },
        user: {
          findUnique: jest.fn(),
        },
        $executeRaw: jest.fn(),
      },
    };

    cache = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    } as unknown as jest.Mocked<CacheService>;

    queue = {
      publish: jest.fn(),
    } as unknown as jest.Mocked<QueueService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApplicationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheService, useValue: cache },
        { provide: QueueService, useValue: queue },
      ],
    }).compile();

    service = module.get<ApplicationsService>(ApplicationsService);
  });

  afterEach(() => jest.clearAllMocks());

  // -----------------------------------------------------------------------
  // create()
  // -----------------------------------------------------------------------
  describe('create()', () => {
    const dto: CreateApplicationDto = { jobId: JOB_UUID };

    it('should create an application and return ApplicationResponseDto', async () => {
      prisma.client.job.findUnique.mockResolvedValue(mockJob);
      prisma.client.application.findFirst.mockResolvedValue(null);
      prisma.client.application.create.mockResolvedValue(mockApplication);

      const result = await service.create(APPLICANT_UUID, dto);

      expect(prisma.client.application.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'pending' }),
          include: {
            user: true,
            job: { include: { company: { include: { owner: true } } } },
          },
        }),
      );
      expect(result).toEqual(mockApplicationResponse);
    });

    it('should publish application:created event to RabbitMQ after DB save', async () => {
      prisma.client.job.findUnique.mockResolvedValue(mockJob);
      prisma.client.application.findFirst.mockResolvedValue(null);
      prisma.client.application.create.mockResolvedValue(mockApplication);

      await service.create(APPLICANT_UUID, dto);

      expect(queue.publish).toHaveBeenCalledWith('application.created', {
        applicationId: APPLICATION_UUID,
      });
    });

    it('should invalidate user and job cache after creation', async () => {
      prisma.client.job.findUnique.mockResolvedValue(mockJob);
      prisma.client.application.findFirst.mockResolvedValue(null);
      prisma.client.application.create.mockResolvedValue(mockApplication);

      await service.create(APPLICANT_UUID, dto);

      expect(cache.del).toHaveBeenCalledWith(
        `applications:user:${APPLICANT_UUID}`,
      );
      expect(cache.del).toHaveBeenCalledWith(`applications:job:${JOB_UUID}`);
    });

    it('should throw NotFoundException when job does not exist', async () => {
      prisma.client.job.findUnique.mockResolvedValue(null);

      await expect(service.create(APPLICANT_UUID, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when applicant owns the company', async () => {
      const ownersJob = {
        ...mockJob,
        company: {
          ...mockCompany,
          owner: { ...mockOwner, uuid: APPLICANT_UUID },
        },
      };
      prisma.client.job.findUnique.mockResolvedValue(ownersJob);

      await expect(service.create(APPLICANT_UUID, dto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ConflictException when user already applied to job', async () => {
      prisma.client.job.findUnique.mockResolvedValue(mockJob);
      prisma.client.application.findFirst.mockResolvedValue(mockApplication);

      await expect(service.create(APPLICANT_UUID, dto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should not expose integer id or deletedAt in response', async () => {
      prisma.client.job.findUnique.mockResolvedValue(mockJob);
      prisma.client.application.findFirst.mockResolvedValue(null);
      prisma.client.application.create.mockResolvedValue(mockApplication);

      const result = await service.create(APPLICANT_UUID, dto);

      expect(result.id).toBe(APPLICATION_UUID);
      expect(typeof result.id).toBe('string');
      expect(result).not.toHaveProperty('deletedAt');
    });
  });

  // -----------------------------------------------------------------------
  // findAll()
  // -----------------------------------------------------------------------
  describe('findAll()', () => {
    it('should return a paginated list of applications', async () => {
      prisma.client.application.findMany.mockResolvedValue([mockApplication]);
      prisma.client.application.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(prisma.client.application.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 }),
      );
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual(mockApplicationResponse);
    });

    it('should return correct pagination meta', async () => {
      prisma.client.application.findMany.mockResolvedValue([mockApplication]);
      prisma.client.application.count.mockResolvedValue(25);

      const result = await service.findAll({ page: 2, limit: 10 });

      expect(result.meta).toEqual({
        total: 25,
        page: 2,
        limit: 10,
        totalPages: 3,
      });
    });
  });

  // -----------------------------------------------------------------------
  // findByUuid()
  // -----------------------------------------------------------------------
  describe('findByUuid()', () => {
    it('should return cached application if present in Redis', async () => {
      cache.get.mockResolvedValue(mockApplicationResponse);

      const result = await service.findByUuid(APPLICATION_UUID, APPLICANT_UUID);

      expect(cache.get).toHaveBeenCalledWith(
        `applications:${APPLICATION_UUID}`,
      );
      expect(prisma.client.application.findUnique).not.toHaveBeenCalled();
      expect(result.data).toEqual(mockApplicationResponse);
      expect(result.source).toBe('cache');
    });

    it('should fetch from DB and cache result on cache miss', async () => {
      cache.get.mockResolvedValue(null);
      prisma.client.application.findUnique.mockResolvedValue(mockApplication);

      const result = await service.findByUuid(APPLICATION_UUID, APPLICANT_UUID);

      expect(cache.set).toHaveBeenCalledWith(
        `applications:${APPLICATION_UUID}`,
        mockApplicationResponse,
        3600,
      );
      expect(result.source).toBe('database');
    });

    it('should allow job company owner to access application', async () => {
      cache.get.mockResolvedValue(null);
      prisma.client.application.findUnique.mockResolvedValue(mockApplication);

      const result = await service.findByUuid(APPLICATION_UUID, OWNER_UUID);

      expect(result.data).toEqual(mockApplicationResponse);
    });

    it('should throw ForbiddenException for unauthorized user', async () => {
      cache.get.mockResolvedValue(null);
      prisma.client.application.findUnique.mockResolvedValue(mockApplication);

      await expect(
        service.findByUuid(APPLICATION_UUID, OTHER_UUID),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when application not found', async () => {
      cache.get.mockResolvedValue(null);
      prisma.client.application.findUnique.mockResolvedValue(null);

      await expect(
        service.findByUuid(APPLICATION_UUID, APPLICANT_UUID),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for invalid UUID format', async () => {
      await expect(
        service.findByUuid('not-a-uuid', APPLICANT_UUID),
      ).rejects.toThrow(NotFoundException);
      expect(cache.get).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // findByUser()
  // -----------------------------------------------------------------------
  describe('findByUser()', () => {
    it('should return cached user applications from Redis', async () => {
      const cachedList = {
        items: [mockApplicationResponse],
        meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
      };
      cache.get.mockResolvedValue(cachedList);

      const result = await service.findByUser(APPLICANT_UUID, APPLICANT_UUID, {
        page: 1,
        limit: 10,
      });

      expect(cache.get).toHaveBeenCalledWith(
        `applications:user:${APPLICANT_UUID}`,
      );
      expect(result).toEqual(cachedList);
    });

    it('should fetch from DB on cache miss and cache result', async () => {
      cache.get.mockResolvedValue(null);
      prisma.client.user.findUnique.mockResolvedValue(mockApplicant);
      prisma.client.application.findMany.mockResolvedValue([mockApplication]);
      prisma.client.application.count.mockResolvedValue(1);

      const result = await service.findByUser(APPLICANT_UUID, APPLICANT_UUID, {
        page: 1,
        limit: 10,
      });

      expect(cache.set).toHaveBeenCalledWith(
        `applications:user:${APPLICANT_UUID}`,
        expect.any(Object),
        3600,
      );
      expect(result.items[0]).toEqual(mockApplicationResponse);
    });

    it('should throw ForbiddenException when accessing another user applications', async () => {
      await expect(
        service.findByUser(APPLICANT_UUID, OTHER_UUID, { page: 1, limit: 10 }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when user does not exist', async () => {
      cache.get.mockResolvedValue(null);
      prisma.client.user.findUnique.mockResolvedValue(null);

      await expect(
        service.findByUser(APPLICANT_UUID, APPLICANT_UUID, {
          page: 1,
          limit: 10,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for invalid UUID format', async () => {
      await expect(
        service.findByUser('not-a-uuid', 'not-a-uuid', { page: 1, limit: 10 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -----------------------------------------------------------------------
  // findByJob()
  // -----------------------------------------------------------------------
  describe('findByJob()', () => {
    it('should return cached job applications from Redis', async () => {
      const cachedList = {
        items: [mockApplicationResponse],
        meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
      };
      cache.get.mockResolvedValue(cachedList);

      const result = await service.findByJob(JOB_UUID, OWNER_UUID, {
        page: 1,
        limit: 10,
      });

      expect(cache.get).toHaveBeenCalledWith(`applications:job:${JOB_UUID}`);
      expect(result).toEqual(cachedList);
    });

    it('should fetch from DB on cache miss and cache result', async () => {
      cache.get.mockResolvedValue(null);
      prisma.client.job.findUnique.mockResolvedValue(mockJob);
      prisma.client.application.findMany.mockResolvedValue([mockApplication]);
      prisma.client.application.count.mockResolvedValue(1);

      const result = await service.findByJob(JOB_UUID, OWNER_UUID, {
        page: 1,
        limit: 10,
      });

      expect(cache.set).toHaveBeenCalledWith(
        `applications:job:${JOB_UUID}`,
        expect.any(Object),
        3600,
      );
      expect(result.items[0]).toEqual(mockApplicationResponse);
    });

    it('should throw ForbiddenException when non-owner accesses job applications', async () => {
      cache.get.mockResolvedValue(null);
      prisma.client.job.findUnique.mockResolvedValue(mockJob);

      await expect(
        service.findByJob(JOB_UUID, OTHER_UUID, { page: 1, limit: 10 }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when job does not exist', async () => {
      cache.get.mockResolvedValue(null);
      prisma.client.job.findUnique.mockResolvedValue(null);

      await expect(
        service.findByJob(JOB_UUID, OWNER_UUID, { page: 1, limit: 10 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -----------------------------------------------------------------------
  // updateStatus()
  // -----------------------------------------------------------------------
  describe('updateStatus()', () => {
    const acceptDto: UpdateApplicationStatusDto = { status: 'accepted' };
    const rejectedDto: UpdateApplicationStatusDto = { status: 'rejected' };

    it('should update status from pending to accepted', async () => {
      prisma.client.application.findUnique.mockResolvedValue(mockApplication);
      prisma.client.application.update.mockResolvedValue({
        ...mockApplication,
        status: 'accepted',
      });

      await service.updateStatus(APPLICATION_UUID, OWNER_UUID, acceptDto);

      expect(prisma.client.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'accepted' },
        }),
      );
    });

    it('should update status from pending to rejected', async () => {
      prisma.client.application.findUnique.mockResolvedValue(mockApplication);
      prisma.client.application.update.mockResolvedValue({
        ...mockApplication,
        status: 'rejected',
      });

      await service.updateStatus(APPLICATION_UUID, OWNER_UUID, rejectedDto);

      expect(prisma.client.application.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'rejected' } }),
      );
    });

    it('should update status from accepted to rejected', async () => {
      const acceptedApplication = { ...mockApplication, status: 'accepted' };
      prisma.client.application.findUnique.mockResolvedValue(
        acceptedApplication,
      );
      prisma.client.application.update.mockResolvedValue({
        ...acceptedApplication,
        status: 'rejected',
      });

      await service.updateStatus(APPLICATION_UUID, OWNER_UUID, rejectedDto);

      expect(prisma.client.application.update).toHaveBeenCalled();
    });

    it('should update status from rejected to accepted', async () => {
      const rejectedApplication = { ...mockApplication, status: 'rejected' };
      prisma.client.application.findUnique.mockResolvedValue(
        rejectedApplication,
      );
      prisma.client.application.update.mockResolvedValue({
        ...rejectedApplication,
        status: 'accepted',
      });

      await service.updateStatus(APPLICATION_UUID, OWNER_UUID, acceptDto);

      expect(prisma.client.application.update).toHaveBeenCalled();
    });

    it('should throw UnprocessableEntityException for rejected → pending transition', async () => {
      const rejectedApp = { ...mockApplication, status: 'rejected' };
      prisma.client.application.findUnique.mockResolvedValue(rejectedApp);

      await expect(
        service.updateStatus(APPLICATION_UUID, OWNER_UUID, {
          status: 'pending',
        }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should throw UnprocessableEntityException for accepted → pending transition', async () => {
      const acceptedApp = { ...mockApplication, status: 'accepted' };
      prisma.client.application.findUnique.mockResolvedValue(acceptedApp);

      await expect(
        service.updateStatus(APPLICATION_UUID, OWNER_UUID, {
          status: 'pending',
        }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should throw ForbiddenException when non-owner updates status', async () => {
      prisma.client.application.findUnique.mockResolvedValue(mockApplication);

      await expect(
        service.updateStatus(APPLICATION_UUID, OTHER_UUID, acceptDto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException for non-existent application', async () => {
      prisma.client.application.findUnique.mockResolvedValue(null);

      await expect(
        service.updateStatus(APPLICATION_UUID, OWNER_UUID, acceptDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should invalidate all related caches after update', async () => {
      prisma.client.application.findUnique.mockResolvedValue(mockApplication);
      prisma.client.application.update.mockResolvedValue({
        ...mockApplication,
        status: 'accepted',
      });

      await service.updateStatus(APPLICATION_UUID, OWNER_UUID, acceptDto);

      expect(cache.del).toHaveBeenCalledWith(
        `applications:${APPLICATION_UUID}`,
      );
      expect(cache.del).toHaveBeenCalledWith(
        `applications:user:${APPLICANT_UUID}`,
      );
      expect(cache.del).toHaveBeenCalledWith(`applications:job:${JOB_UUID}`);
    });
  });

  // -----------------------------------------------------------------------
  // remove()
  // -----------------------------------------------------------------------
  describe('remove()', () => {
    it('should hard delete the application when called by applicant', async () => {
      prisma.client.application.findUnique.mockResolvedValue(mockApplication);
      prisma.client.$executeRaw.mockResolvedValue(1);

      await service.remove(APPLICATION_UUID, APPLICANT_UUID);

      expect(prisma.client.$executeRaw).toHaveBeenCalled();
    });

    it('should throw ForbiddenException when non-applicant tries to delete', async () => {
      prisma.client.application.findUnique.mockResolvedValue(mockApplication);

      await expect(
        service.remove(APPLICATION_UUID, OWNER_UUID),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException for non-existent application', async () => {
      prisma.client.application.findUnique.mockResolvedValue(null);

      await expect(
        service.remove(APPLICATION_UUID, APPLICANT_UUID),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for invalid UUID format', async () => {
      await expect(
        service.remove('not-a-uuid', APPLICANT_UUID),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
