import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../../common/guards/jwt-auth.guard';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { JobResponseDto } from './dto/job-response.dto';
import type { PaginatedResult } from '../profile/dto/pagination-query.dto';

const OWNER_UUID = '111e8400-e29b-41d4-a716-446655440001';
const COMPANY_UUID = '550e8400-e29b-41d4-a716-446655440000';
const CATEGORY_UUID = '660e8400-e29b-41d4-a716-446655440002';
const JOB_UUID = '770e8400-e29b-41d4-a716-446655440003';

const mockUser: JwtPayload = { id: OWNER_UUID };

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
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  },
  category: {
    id: CATEGORY_UUID,
    name: 'Engineering',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  },
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const mockFindResult = {
  data: mockJobResponse,
  source: 'database' as const,
};

const mockPaginatedResult: PaginatedResult<JobResponseDto> = {
  items: [mockJobResponse],
  meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
};

const mockRes = {
  header: jest.fn(),
} as unknown as Response;

describe('JobsController', () => {
  let controller: JobsController;
  let service: jest.Mocked<JobsService>;

  beforeEach(async () => {
    service = {
      create: jest.fn(),
      findAll: jest.fn(),
      findByUuid: jest.fn(),
      findByCompany: jest.fn(),
      findByCategory: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<JobsService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [JobsController],
      providers: [{ provide: JobsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<JobsController>(JobsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // GET /jobs
  // -----------------------------------------------------------------------
  describe('getAll()', () => {
    it('should return paginated list of jobs', async () => {
      service.findAll.mockResolvedValue(mockPaginatedResult);

      const result = await controller.getAll({ page: 1, limit: 10 });

      expect(service.findAll).toHaveBeenCalledWith({ page: 1, limit: 10 });
      expect(result).toEqual(mockPaginatedResult);
    });

    it('should pass title and companyName filters to service', async () => {
      service.findAll.mockResolvedValue(mockPaginatedResult);

      await controller.getAll({
        page: 1,
        limit: 10,
        title: 'engineer',
        companyName: 'acme',
      });

      expect(service.findAll).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
        title: 'engineer',
        companyName: 'acme',
      });
    });
  });

  // -----------------------------------------------------------------------
  // GET /jobs/company/:companyId
  // -----------------------------------------------------------------------
  describe('getByCompany()', () => {
    it('should return paginated jobs for a company', async () => {
      service.findByCompany.mockResolvedValue(mockPaginatedResult);

      const result = await controller.getByCompany(COMPANY_UUID, {
        page: 1,
        limit: 10,
      });

      expect(service.findByCompany).toHaveBeenCalledWith(COMPANY_UUID, {
        page: 1,
        limit: 10,
      });
      expect(result).toEqual(mockPaginatedResult);
    });

    it('should propagate NotFoundException from service', async () => {
      service.findByCompany.mockRejectedValue(
        new NotFoundException('Company not found'),
      );

      await expect(
        controller.getByCompany(COMPANY_UUID, { page: 1, limit: 10 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -----------------------------------------------------------------------
  // GET /jobs/category/:categoryId
  // -----------------------------------------------------------------------
  describe('getByCategory()', () => {
    it('should return paginated jobs for a category', async () => {
      service.findByCategory.mockResolvedValue(mockPaginatedResult);

      const result = await controller.getByCategory(CATEGORY_UUID, {
        page: 1,
        limit: 10,
      });

      expect(service.findByCategory).toHaveBeenCalledWith(CATEGORY_UUID, {
        page: 1,
        limit: 10,
      });
      expect(result).toEqual(mockPaginatedResult);
    });

    it('should propagate NotFoundException from service', async () => {
      service.findByCategory.mockRejectedValue(
        new NotFoundException('Category not found'),
      );

      await expect(
        controller.getByCategory(CATEGORY_UUID, { page: 1, limit: 10 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -----------------------------------------------------------------------
  // GET /jobs/:uuid
  // -----------------------------------------------------------------------
  describe('getById()', () => {
    it('should return job and set X-Data-Source: database header', async () => {
      service.findByUuid.mockResolvedValue(mockFindResult);

      const result = await controller.getById(JOB_UUID, mockRes);

      expect(service.findByUuid).toHaveBeenCalledWith(JOB_UUID);
      expect(mockRes.header).toHaveBeenCalledWith('X-Data-Source', 'database');
      expect(result).toEqual(mockJobResponse);
    });

    it('should set X-Data-Source: cache when served from Redis', async () => {
      service.findByUuid.mockResolvedValue({
        data: mockJobResponse,
        source: 'cache',
      });

      await controller.getById(JOB_UUID, mockRes);

      expect(mockRes.header).toHaveBeenCalledWith('X-Data-Source', 'cache');
    });

    it('should propagate NotFoundException from service', async () => {
      service.findByUuid.mockRejectedValue(
        new NotFoundException('Job not found'),
      );

      await expect(controller.getById(JOB_UUID, mockRes)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return id as UUID string, not integer', async () => {
      service.findByUuid.mockResolvedValue(mockFindResult);

      const result = await controller.getById(JOB_UUID, mockRes);

      expect(typeof result.id).toBe('string');
      expect(result.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });
  });

  // -----------------------------------------------------------------------
  // POST /jobs
  // -----------------------------------------------------------------------
  describe('create()', () => {
    const dto: CreateJobDto = {
      companyId: COMPANY_UUID,
      categoryId: CATEGORY_UUID,
      title: 'New Job',
      description: 'Description',
      location: 'Jakarta',
      salary: 5000000,
      type: 'Full-time',
    };

    it('should create a job and return JobResponseDto', async () => {
      service.create.mockResolvedValue(mockJobResponse);

      const result = await controller.create(mockUser, dto);

      expect(service.create).toHaveBeenCalledWith(OWNER_UUID, dto);
      expect(result).toEqual(mockJobResponse);
    });

    it('should propagate ForbiddenException from service', async () => {
      service.create.mockRejectedValue(new ForbiddenException('Not the owner'));

      await expect(controller.create(mockUser, dto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should propagate NotFoundException from service', async () => {
      service.create.mockRejectedValue(
        new NotFoundException('Company not found'),
      );

      await expect(controller.create(mockUser, dto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -----------------------------------------------------------------------
  // PUT /jobs/:uuid
  // -----------------------------------------------------------------------
  describe('update()', () => {
    const dto: UpdateJobDto = { title: 'Updated Title' };

    it('should update job and return success message', async () => {
      service.update.mockResolvedValue(undefined);

      const result = await controller.update(JOB_UUID, mockUser, dto);

      expect(service.update).toHaveBeenCalledWith(JOB_UUID, OWNER_UUID, dto);
      expect(result).toEqual({
        status: 'success',
        message: 'Job updated successfully',
      });
    });

    it('should propagate ForbiddenException from service', async () => {
      service.update.mockRejectedValue(new ForbiddenException('Not the owner'));

      await expect(controller.update(JOB_UUID, mockUser, dto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should propagate NotFoundException from service', async () => {
      service.update.mockRejectedValue(new NotFoundException('Job not found'));

      await expect(controller.update(JOB_UUID, mockUser, dto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -----------------------------------------------------------------------
  // DELETE /jobs/:uuid
  // -----------------------------------------------------------------------
  describe('remove()', () => {
    it('should soft delete job and return success message', async () => {
      service.remove.mockResolvedValue(undefined);

      const result = await controller.remove(JOB_UUID, mockUser);

      expect(service.remove).toHaveBeenCalledWith(JOB_UUID, OWNER_UUID);
      expect(result).toEqual({
        status: 'success',
        message: 'Job deleted successfully',
      });
    });

    it('should propagate ForbiddenException from service', async () => {
      service.remove.mockRejectedValue(new ForbiddenException('Not the owner'));

      await expect(controller.remove(JOB_UUID, mockUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should propagate NotFoundException from service', async () => {
      service.remove.mockRejectedValue(new NotFoundException('Job not found'));

      await expect(controller.remove(JOB_UUID, mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
