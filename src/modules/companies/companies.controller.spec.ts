import { Test, TestingModule } from '@nestjs/testing';
import {
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../../common/guards/jwt-auth.guard';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { CompanyResponseDto } from './dto/company-response.dto';
import type { PaginatedResult } from '../profile/dto/pagination-query.dto';

const OWNER_UUID = '111e8400-e29b-41d4-a716-446655440001';
const COMPANY_UUID = '550e8400-e29b-41d4-a716-446655440000';

const mockUser: JwtPayload = { id: OWNER_UUID };

const mockCompanyResponse: CompanyResponseDto = {
  id: COMPANY_UUID,
  name: 'Test Company',
  description: 'A test company',
  location: 'Jakarta',
  userId: OWNER_UUID,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const mockFindResult = {
  data: mockCompanyResponse,
  source: 'database' as const,
};

const mockPaginatedResult: PaginatedResult<CompanyResponseDto> = {
  items: [mockCompanyResponse],
  meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
};

const mockRes = {
  header: jest.fn(),
} as unknown as Response;

describe('CompaniesController', () => {
  let controller: CompaniesController;
  let service: jest.Mocked<CompaniesService>;

  beforeEach(async () => {
    service = {
      create: jest.fn(),
      findAll: jest.fn(),
      findByUuid: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<CompaniesService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CompaniesController],
      providers: [{ provide: CompaniesService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CompaniesController>(CompaniesController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // GET /companies
  // -----------------------------------------------------------------------
  describe('getAll()', () => {
    it('should return paginated list of companies', async () => {
      service.findAll.mockResolvedValue(mockPaginatedResult);

      const result = await controller.getAll({ page: 1, limit: 10 });

      expect(service.findAll).toHaveBeenCalledWith({ page: 1, limit: 10 });
      expect(result).toEqual(mockPaginatedResult);
    });
  });

  // -----------------------------------------------------------------------
  // GET /companies/:uuid
  // -----------------------------------------------------------------------
  describe('getById()', () => {
    it('should return company and set X-Data-Source: database header', async () => {
      service.findByUuid.mockResolvedValue(mockFindResult);

      const result = await controller.getById(COMPANY_UUID, mockRes);

      expect(service.findByUuid).toHaveBeenCalledWith(COMPANY_UUID);
      expect(mockRes.header).toHaveBeenCalledWith('X-Data-Source', 'database');
      expect(result).toEqual(mockCompanyResponse);
    });

    it('should set X-Data-Source: cache when served from Redis', async () => {
      service.findByUuid.mockResolvedValue({
        data: mockCompanyResponse,
        source: 'cache',
      });

      await controller.getById(COMPANY_UUID, mockRes);

      expect(mockRes.header).toHaveBeenCalledWith('X-Data-Source', 'cache');
    });

    it('should propagate NotFoundException from service', async () => {
      service.findByUuid.mockRejectedValue(
        new NotFoundException('Company not found'),
      );

      await expect(controller.getById(COMPANY_UUID, mockRes)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return id as UUID string, not integer', async () => {
      service.findByUuid.mockResolvedValue(mockFindResult);

      const result = await controller.getById(COMPANY_UUID, mockRes);

      expect(typeof result.id).toBe('string');
      expect(result.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });
  });

  // -----------------------------------------------------------------------
  // POST /companies
  // -----------------------------------------------------------------------
  describe('create()', () => {
    const dto: CreateCompanyDto = {
      name: 'New Company',
      description: 'Description',
      location: 'Surabaya',
    };

    it('should create a company and return CompanyResponseDto', async () => {
      service.create.mockResolvedValue(mockCompanyResponse);

      const result = await controller.create(mockUser, dto);

      expect(service.create).toHaveBeenCalledWith(OWNER_UUID, dto);
      expect(result).toEqual(mockCompanyResponse);
    });

    it('should propagate errors from service', async () => {
      service.create.mockRejectedValue(new Error('DB error'));

      await expect(controller.create(mockUser, dto)).rejects.toThrow(
        'DB error',
      );
    });
  });

  // -----------------------------------------------------------------------
  // PUT /companies/:uuid
  // -----------------------------------------------------------------------
  describe('update()', () => {
    const dto: UpdateCompanyDto = { name: 'Updated Name' };

    it('should update company and return success message', async () => {
      service.update.mockResolvedValue(undefined);

      const result = await controller.update(COMPANY_UUID, mockUser, dto);

      expect(service.update).toHaveBeenCalledWith(COMPANY_UUID, OWNER_UUID, dto);
      expect(result).toEqual({ status: 'success', message: 'Company updated successfully' });
    });

    it('should propagate ForbiddenException from service', async () => {
      service.update.mockRejectedValue(
        new ForbiddenException('Not the owner'),
      );

      await expect(
        controller.update(COMPANY_UUID, mockUser, dto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should propagate NotFoundException from service', async () => {
      service.update.mockRejectedValue(
        new NotFoundException('Company not found'),
      );

      await expect(
        controller.update(COMPANY_UUID, mockUser, dto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -----------------------------------------------------------------------
  // DELETE /companies/:uuid
  // -----------------------------------------------------------------------
  describe('remove()', () => {
    it('should soft delete company and return success message', async () => {
      service.remove.mockResolvedValue(undefined);

      const result = await controller.remove(COMPANY_UUID, mockUser);

      expect(service.remove).toHaveBeenCalledWith(COMPANY_UUID, OWNER_UUID);
      expect(result).toEqual({ status: 'success', message: 'Company deleted successfully' });
    });

    it('should propagate ForbiddenException from service', async () => {
      service.remove.mockRejectedValue(
        new ForbiddenException('Not the owner'),
      );

      await expect(controller.remove(COMPANY_UUID, mockUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should propagate NotFoundException from service', async () => {
      service.remove.mockRejectedValue(
        new NotFoundException('Company not found'),
      );

      await expect(controller.remove(COMPANY_UUID, mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
