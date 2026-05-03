import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../../common/guards/jwt-auth.guard';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationStatusDto } from './dto/update-application-status.dto';
import { ApplicationResponseDto } from './dto/application-response.dto';
import type { PaginatedResult } from '../profile/dto/pagination-query.dto';

const APPLICANT_UUID = '111e8400-e29b-41d4-a716-446655440001';
const OWNER_UUID = '222e8400-e29b-41d4-a716-446655440002';
const JOB_UUID = '330e8400-e29b-41d4-a716-446655440003';
const APPLICATION_UUID = '550e8400-e29b-41d4-a716-446655440005';

const mockApplicantUser: JwtPayload = { id: APPLICANT_UUID };
const mockOwnerUser: JwtPayload = { id: OWNER_UUID };

const mockApplicationResponse: ApplicationResponseDto = {
  id: APPLICATION_UUID,
  jobId: JOB_UUID,
  userId: APPLICANT_UUID,
  status: 'pending',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const mockFindResult = {
  data: mockApplicationResponse,
  source: 'database' as const,
};

const mockPaginatedResult: PaginatedResult<ApplicationResponseDto> = {
  items: [mockApplicationResponse],
  meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
};

const mockRes = {
  header: jest.fn(),
} as unknown as Response;

describe('ApplicationsController', () => {
  let controller: ApplicationsController;
  let service: jest.Mocked<ApplicationsService>;

  beforeEach(async () => {
    service = {
      create: jest.fn(),
      findAll: jest.fn(),
      findByUuid: jest.fn(),
      findByUser: jest.fn(),
      findByJob: jest.fn(),
      updateStatus: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<ApplicationsService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApplicationsController],
      providers: [{ provide: ApplicationsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ApplicationsController>(ApplicationsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // POST /applications
  // -----------------------------------------------------------------------
  describe('create()', () => {
    const dto: CreateApplicationDto = { jobId: JOB_UUID };

    it('should create an application and return 201', async () => {
      service.create.mockResolvedValue(mockApplicationResponse);

      const result = await controller.create(mockApplicantUser, dto);

      expect(service.create).toHaveBeenCalledWith(APPLICANT_UUID, dto);
      expect(result).toEqual(mockApplicationResponse);
    });

    it('should propagate ForbiddenException from service', async () => {
      service.create.mockRejectedValue(
        new ForbiddenException('Cannot apply to own company'),
      );

      await expect(controller.create(mockApplicantUser, dto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should propagate ConflictException from service', async () => {
      service.create.mockRejectedValue(
        new ConflictException('Already applied'),
      );

      await expect(controller.create(mockApplicantUser, dto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // -----------------------------------------------------------------------
  // GET /applications
  // -----------------------------------------------------------------------
  describe('getAll()', () => {
    it('should return paginated list of applications', async () => {
      service.findAll.mockResolvedValue(mockPaginatedResult);

      const result = await controller.getAll({ page: 1, limit: 10 });

      expect(service.findAll).toHaveBeenCalledWith({ page: 1, limit: 10 });
      expect(result).toEqual(mockPaginatedResult);
    });
  });

  // -----------------------------------------------------------------------
  // GET /applications/:uuid
  // -----------------------------------------------------------------------
  describe('getById()', () => {
    it('should return application and set X-Data-Source: database header', async () => {
      service.findByUuid.mockResolvedValue(mockFindResult);

      const result = await controller.getById(
        APPLICATION_UUID,
        mockApplicantUser,
        mockRes,
      );

      expect(service.findByUuid).toHaveBeenCalledWith(
        APPLICATION_UUID,
        APPLICANT_UUID,
      );
      expect(mockRes.header).toHaveBeenCalledWith('X-Data-Source', 'database');
      expect(result).toEqual(mockApplicationResponse);
    });

    it('should set X-Data-Source: cache when served from Redis', async () => {
      service.findByUuid.mockResolvedValue({
        data: mockApplicationResponse,
        source: 'cache',
      });

      await controller.getById(APPLICATION_UUID, mockApplicantUser, mockRes);

      expect(mockRes.header).toHaveBeenCalledWith('X-Data-Source', 'cache');
    });

    it('should propagate NotFoundException', async () => {
      service.findByUuid.mockRejectedValue(
        new NotFoundException('Application not found'),
      );

      await expect(
        controller.getById(APPLICATION_UUID, mockApplicantUser, mockRes),
      ).rejects.toThrow(NotFoundException);
    });

    it('should propagate ForbiddenException', async () => {
      service.findByUuid.mockRejectedValue(
        new ForbiddenException('No access'),
      );

      await expect(
        controller.getById(APPLICATION_UUID, mockApplicantUser, mockRes),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // -----------------------------------------------------------------------
  // GET /applications/user/:userId
  // -----------------------------------------------------------------------
  describe('getByUser()', () => {
    it('should return applications for a user', async () => {
      service.findByUser.mockResolvedValue(mockPaginatedResult);

      const result = await controller.getByUser(
        APPLICANT_UUID,
        mockApplicantUser,
        { page: 1, limit: 10 },
      );

      expect(service.findByUser).toHaveBeenCalledWith(
        APPLICANT_UUID,
        APPLICANT_UUID,
        { page: 1, limit: 10 },
      );
      expect(result).toEqual(mockPaginatedResult);
    });

    it('should propagate ForbiddenException when accessing other user applications', async () => {
      service.findByUser.mockRejectedValue(
        new ForbiddenException('Self only'),
      );

      await expect(
        controller.getByUser(APPLICANT_UUID, mockOwnerUser, { page: 1, limit: 10 }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // -----------------------------------------------------------------------
  // GET /applications/job/:jobId
  // -----------------------------------------------------------------------
  describe('getByJob()', () => {
    it('should return applications for a job', async () => {
      service.findByJob.mockResolvedValue(mockPaginatedResult);

      const result = await controller.getByJob(
        JOB_UUID,
        mockOwnerUser,
        { page: 1, limit: 10 },
      );

      expect(service.findByJob).toHaveBeenCalledWith(
        JOB_UUID,
        OWNER_UUID,
        { page: 1, limit: 10 },
      );
      expect(result).toEqual(mockPaginatedResult);
    });

    it('should propagate ForbiddenException for non-company-owner', async () => {
      service.findByJob.mockRejectedValue(
        new ForbiddenException('Company owner only'),
      );

      await expect(
        controller.getByJob(JOB_UUID, mockApplicantUser, { page: 1, limit: 10 }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // -----------------------------------------------------------------------
  // PUT /applications/:uuid
  // -----------------------------------------------------------------------
  describe('updateStatus()', () => {
    const dto: UpdateApplicationStatusDto = { status: 'accepted' };

    it('should update status and return success message', async () => {
      service.updateStatus.mockResolvedValue(undefined);

      const result = await controller.updateStatus(
        APPLICATION_UUID,
        mockOwnerUser,
        dto,
      );

      expect(service.updateStatus).toHaveBeenCalledWith(
        APPLICATION_UUID,
        OWNER_UUID,
        dto,
      );
      expect(result).toEqual({
        status: 'success',
        message: 'Application status updated successfully',
      });
    });

    it('should propagate ForbiddenException from service', async () => {
      service.updateStatus.mockRejectedValue(
        new ForbiddenException('Not the owner'),
      );

      await expect(
        controller.updateStatus(APPLICATION_UUID, mockOwnerUser, dto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should propagate UnprocessableEntityException for invalid transition', async () => {
      service.updateStatus.mockRejectedValue(
        new UnprocessableEntityException('Invalid transition'),
      );

      await expect(
        controller.updateStatus(APPLICATION_UUID, mockOwnerUser, dto),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });

  // -----------------------------------------------------------------------
  // DELETE /applications/:uuid
  // -----------------------------------------------------------------------
  describe('remove()', () => {
    it('should hard delete application and return success message', async () => {
      service.remove.mockResolvedValue(undefined);

      const result = await controller.remove(
        APPLICATION_UUID,
        mockApplicantUser,
      );

      expect(service.remove).toHaveBeenCalledWith(
        APPLICATION_UUID,
        APPLICANT_UUID,
      );
      expect(result).toEqual({
        status: 'success',
        message: 'Application deleted successfully',
      });
    });

    it('should propagate ForbiddenException when non-applicant deletes', async () => {
      service.remove.mockRejectedValue(
        new ForbiddenException('Applicant only'),
      );

      await expect(
        controller.remove(APPLICATION_UUID, mockOwnerUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should propagate NotFoundException', async () => {
      service.remove.mockRejectedValue(
        new NotFoundException('Application not found'),
      );

      await expect(
        controller.remove(APPLICATION_UUID, mockApplicantUser),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
