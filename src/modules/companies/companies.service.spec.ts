import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { CompanyResponseDto } from './dto/company-response.dto';

const OWNER_UUID = '111e8400-e29b-41d4-a716-446655440001';
const COMPANY_UUID = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_UUID = '999e8400-e29b-41d4-a716-446655440099';

const mockOwner = {
  id: 1,
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
  userId: 1,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  deletedAt: null,
  owner: mockOwner,
};

const mockCompanyResponse: CompanyResponseDto = {
  id: COMPANY_UUID,
  name: 'Test Company',
  description: 'A test company',
  location: 'Jakarta',
  userId: OWNER_UUID,
  createdAt: mockCompany.createdAt,
  updatedAt: mockCompany.updatedAt,
};

describe('CompaniesService', () => {
  let service: CompaniesService;
  let prisma: {
    client: {
      company: {
        findMany: jest.Mock;
        count: jest.Mock;
        findUnique: jest.Mock;
        create: jest.Mock;
        update: jest.Mock;
      };
    };
  };
  let cache: jest.Mocked<CacheService>;

  beforeEach(async () => {
    prisma = {
      client: {
        company: {
          findMany: jest.fn(),
          count: jest.fn(),
          findUnique: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
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
        CompaniesService,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheService, useValue: cache },
      ],
    }).compile();

    service = module.get<CompaniesService>(CompaniesService);
  });

  afterEach(() => jest.clearAllMocks());

  // -----------------------------------------------------------------------
  // create()
  // -----------------------------------------------------------------------
  describe('create()', () => {
    const dto: CreateCompanyDto = {
      name: 'Test Company',
      description: 'A test company',
      location: 'Jakarta',
    };

    it('should create a company and return CompanyResponseDto', async () => {
      prisma.client.company.create.mockResolvedValue(mockCompany);

      const result = await service.create(OWNER_UUID, dto);

      expect(prisma.client.company.create).toHaveBeenCalledWith({
        data: {
          name: dto.name,
          description: dto.description ?? '',
          location: dto.location,
          owner: { connect: { uuid: OWNER_UUID } },
        },
        include: { owner: true },
      });
      expect(result).toEqual(mockCompanyResponse);
    });

    it('should store empty string when description is not provided', async () => {
      const dtoWithoutDesc: CreateCompanyDto = {
        name: 'Test',
        location: 'Bali',
      };
      prisma.client.company.create.mockResolvedValue({
        ...mockCompany,
        description: '',
      });

      await service.create(OWNER_UUID, dtoWithoutDesc);

      expect(prisma.client.company.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ description: '' }),
        }),
      );
    });

    it('should not expose integer id or deletedAt in response', async () => {
      prisma.client.company.create.mockResolvedValue(mockCompany);

      const result = await service.create(OWNER_UUID, dto);

      expect((result as unknown as Record<string, unknown>)['id']).toBe(
        COMPANY_UUID,
      );
      expect(result).not.toHaveProperty('deletedAt');
      expect(typeof result.id).toBe('string');
    });

    it('should return null description when DB stores empty string', async () => {
      prisma.client.company.create.mockResolvedValue({
        ...mockCompany,
        description: '',
      });

      const result = await service.create(OWNER_UUID, {
        name: 'X',
        location: 'Y',
      });

      expect(result.description).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // findAll()
  // -----------------------------------------------------------------------
  describe('findAll()', () => {
    it('should return a paginated list of companies', async () => {
      prisma.client.company.findMany.mockResolvedValue([mockCompany]);
      prisma.client.company.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(prisma.client.company.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: { owner: true },
        }),
      );
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual(mockCompanyResponse);
    });

    it('should return correct pagination meta', async () => {
      prisma.client.company.findMany.mockResolvedValue([mockCompany]);
      prisma.client.company.count.mockResolvedValue(25);

      const result = await service.findAll({ page: 2, limit: 10 });

      expect(result.meta).toEqual({
        total: 25,
        page: 2,
        limit: 10,
        totalPages: 3,
      });
    });

    it('should use correct skip for page > 1', async () => {
      prisma.client.company.findMany.mockResolvedValue([]);
      prisma.client.company.count.mockResolvedValue(0);

      await service.findAll({ page: 3, limit: 5 });

      expect(prisma.client.company.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 5 }),
      );
    });

    it('should return empty items and total=0 when no companies exist', async () => {
      prisma.client.company.findMany.mockResolvedValue([]);
      prisma.client.company.count.mockResolvedValue(0);

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
    it('should return cached company if present in Redis', async () => {
      cache.get.mockResolvedValue(mockCompanyResponse);

      const result = await service.findByUuid(COMPANY_UUID);

      expect(cache.get).toHaveBeenCalledWith(`companies:${COMPANY_UUID}`);
      expect(prisma.client.company.findUnique).not.toHaveBeenCalled();
      expect(result.data).toEqual(mockCompanyResponse);
      expect(result.source).toBe('cache');
    });

    it('should fetch from DB and cache result on cache miss', async () => {
      cache.get.mockResolvedValue(null);
      prisma.client.company.findUnique.mockResolvedValue(mockCompany);
      cache.set.mockResolvedValue(undefined);

      const result = await service.findByUuid(COMPANY_UUID);

      expect(prisma.client.company.findUnique).toHaveBeenCalledWith({
        where: { uuid: COMPANY_UUID },
        include: { owner: true },
      });
      expect(cache.set).toHaveBeenCalledWith(
        `companies:${COMPANY_UUID}`,
        mockCompanyResponse,
        3600,
      );
      expect(result.data).toEqual(mockCompanyResponse);
      expect(result.source).toBe('database');
    });

    it('should throw NotFoundException when company not found in DB', async () => {
      cache.get.mockResolvedValue(null);
      prisma.client.company.findUnique.mockResolvedValue(null);

      await expect(service.findByUuid(COMPANY_UUID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException for invalid UUID format', async () => {
      await expect(service.findByUuid('not-a-uuid')).rejects.toThrow(
        NotFoundException,
      );
      expect(cache.get).not.toHaveBeenCalled();
      expect(prisma.client.company.findUnique).not.toHaveBeenCalled();
    });

    it('should not expose integer id or deletedAt in result', async () => {
      cache.get.mockResolvedValue(null);
      prisma.client.company.findUnique.mockResolvedValue(mockCompany);

      const result = await service.findByUuid(COMPANY_UUID);

      expect(result.data.id).toBe(COMPANY_UUID);
      expect(result.data).not.toHaveProperty('deletedAt');
    });
  });

  // -----------------------------------------------------------------------
  // update()
  // -----------------------------------------------------------------------
  describe('update()', () => {
    const dto: UpdateCompanyDto = { name: 'Updated Name', location: 'Bandung' };

    it('should update the company and invalidate cache', async () => {
      prisma.client.company.findUnique.mockResolvedValue(mockCompany);
      prisma.client.company.update.mockResolvedValue({
        ...mockCompany,
        name: 'Updated Name',
        location: 'Bandung',
      });
      cache.del.mockResolvedValue(undefined);

      await service.update(COMPANY_UUID, OWNER_UUID, dto);

      expect(prisma.client.company.update).toHaveBeenCalledWith({
        where: { id: mockCompany.id },
        data: expect.objectContaining({
          name: 'Updated Name',
          location: 'Bandung',
        }),
      });
      expect(cache.del).toHaveBeenCalledWith(`companies:${COMPANY_UUID}`);
    });

    it('should throw NotFoundException when company not found', async () => {
      prisma.client.company.findUnique.mockResolvedValue(null);

      await expect(
        service.update(COMPANY_UUID, OWNER_UUID, dto),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.client.company.update).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when user is not the owner', async () => {
      prisma.client.company.findUnique.mockResolvedValue(mockCompany);

      await expect(
        service.update(COMPANY_UUID, OTHER_UUID, dto),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.client.company.update).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException for invalid UUID format', async () => {
      await expect(service.update('bad-uuid', OWNER_UUID, dto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -----------------------------------------------------------------------
  // remove()
  // -----------------------------------------------------------------------
  describe('remove()', () => {
    it('should soft delete the company and invalidate cache', async () => {
      prisma.client.company.findUnique.mockResolvedValue(mockCompany);
      prisma.client.company.update.mockResolvedValue({
        ...mockCompany,
        deletedAt: new Date(),
      });
      cache.del.mockResolvedValue(undefined);

      await service.remove(COMPANY_UUID, OWNER_UUID);

      expect(prisma.client.company.update).toHaveBeenCalledWith({
        where: { id: mockCompany.id },
        data: { deletedAt: expect.any(Date) },
      });
      expect(cache.del).toHaveBeenCalledWith(`companies:${COMPANY_UUID}`);
    });

    it('should throw NotFoundException when company not found', async () => {
      prisma.client.company.findUnique.mockResolvedValue(null);

      await expect(service.remove(COMPANY_UUID, OWNER_UUID)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.client.company.update).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when user is not the owner', async () => {
      prisma.client.company.findUnique.mockResolvedValue(mockCompany);

      await expect(service.remove(COMPANY_UUID, OTHER_UUID)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.client.company.update).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException for invalid UUID format', async () => {
      await expect(service.remove('bad-uuid', OWNER_UUID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -----------------------------------------------------------------------
  // invalidateCache()
  // -----------------------------------------------------------------------
  describe('invalidateCache()', () => {
    it('should delete the cache key for the given uuid', async () => {
      cache.del.mockResolvedValue(undefined);

      await service.invalidateCache(COMPANY_UUID);

      expect(cache.del).toHaveBeenCalledWith(`companies:${COMPANY_UUID}`);
    });
  });
});
