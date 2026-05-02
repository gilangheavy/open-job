import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CategoryResponseDto } from './dto/category-response.dto';

const CATEGORY_UUID = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_UUID = '999e8400-e29b-41d4-a716-446655440099';
const INVALID_UUID = 'not-a-valid-uuid';

const mockCategory = {
  id: 1,
  uuid: CATEGORY_UUID,
  name: 'Engineering',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  deletedAt: null,
};

const mockCategoryResponse: CategoryResponseDto = {
  id: CATEGORY_UUID,
  name: 'Engineering',
  createdAt: mockCategory.createdAt,
  updatedAt: mockCategory.updatedAt,
};

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prisma: {
    client: {
      category: {
        findMany: jest.Mock;
        count: jest.Mock;
        findUnique: jest.Mock;
        findFirst: jest.Mock;
        create: jest.Mock;
        update: jest.Mock;
      };
    };
  };
  let cache: jest.Mocked<CacheService>;

  beforeEach(async () => {
    prisma = {
      client: {
        category: {
          findMany: jest.fn(),
          count: jest.fn(),
          findUnique: jest.fn(),
          findFirst: jest.fn(),
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
        CategoriesService,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheService, useValue: cache },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
  });

  afterEach(() => jest.clearAllMocks());

  // -----------------------------------------------------------------------
  // create()
  // -----------------------------------------------------------------------
  describe('create()', () => {
    const dto: CreateCategoryDto = { name: 'Engineering' };

    it('should create a category and return CategoryResponseDto', async () => {
      prisma.client.category.findFirst.mockResolvedValue(null);
      prisma.client.category.create.mockResolvedValue(mockCategory);

      const result = await service.create(dto);

      expect(prisma.client.category.create).toHaveBeenCalledWith({
        data: { name: dto.name },
      });
      expect(result).toEqual(mockCategoryResponse);
    });

    it('should throw ConflictException if name already exists', async () => {
      prisma.client.category.findFirst.mockResolvedValue(mockCategory);

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      expect(prisma.client.category.create).not.toHaveBeenCalled();
    });

    it('should not expose integer id or deletedAt in response', async () => {
      prisma.client.category.findFirst.mockResolvedValue(null);
      prisma.client.category.create.mockResolvedValue(mockCategory);

      const result = await service.create(dto);

      expect(result.id).toBe(CATEGORY_UUID);
      expect(result).not.toHaveProperty('deletedAt');
      expect(typeof result.id).toBe('string');
    });
  });

  // -----------------------------------------------------------------------
  // findAll()
  // -----------------------------------------------------------------------
  describe('findAll()', () => {
    it('should return a paginated list of categories', async () => {
      prisma.client.category.findMany.mockResolvedValue([mockCategory]);
      prisma.client.category.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(prisma.client.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 10,
          orderBy: { name: 'asc' },
        }),
      );
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual(mockCategoryResponse);
    });

    it('should return correct pagination meta', async () => {
      prisma.client.category.findMany.mockResolvedValue([mockCategory]);
      prisma.client.category.count.mockResolvedValue(25);

      const result = await service.findAll({ page: 2, limit: 10 });

      expect(result.meta).toEqual({
        total: 25,
        page: 2,
        limit: 10,
        totalPages: 3,
      });
    });

    it('should use correct skip for page > 1', async () => {
      prisma.client.category.findMany.mockResolvedValue([]);
      prisma.client.category.count.mockResolvedValue(0);

      await service.findAll({ page: 3, limit: 5 });

      expect(prisma.client.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 5 }),
      );
    });

    it('should return empty items and total=0 when no categories exist', async () => {
      prisma.client.category.findMany.mockResolvedValue([]);
      prisma.client.category.count.mockResolvedValue(0);

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
    it('should return cached category if present in Redis', async () => {
      cache.get.mockResolvedValue(mockCategoryResponse);

      const result = await service.findByUuid(CATEGORY_UUID);

      expect(cache.get).toHaveBeenCalledWith(`categories:${CATEGORY_UUID}`);
      expect(prisma.client.category.findUnique).not.toHaveBeenCalled();
      expect(result.data).toEqual(mockCategoryResponse);
      expect(result.source).toBe('cache');
    });

    it('should fetch from DB and cache result on cache miss', async () => {
      cache.get.mockResolvedValue(null);
      prisma.client.category.findUnique.mockResolvedValue(mockCategory);
      cache.set.mockResolvedValue(undefined);

      const result = await service.findByUuid(CATEGORY_UUID);

      expect(prisma.client.category.findUnique).toHaveBeenCalledWith({
        where: { uuid: CATEGORY_UUID },
      });
      expect(cache.set).toHaveBeenCalledWith(
        `categories:${CATEGORY_UUID}`,
        mockCategoryResponse,
        3600,
      );
      expect(result.data).toEqual(mockCategoryResponse);
      expect(result.source).toBe('database');
    });

    it('should throw NotFoundException if category does not exist', async () => {
      cache.get.mockResolvedValue(null);
      prisma.client.category.findUnique.mockResolvedValue(null);

      await expect(service.findByUuid(CATEGORY_UUID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException for invalid UUID format', async () => {
      await expect(service.findByUuid(INVALID_UUID)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.client.category.findUnique).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // update()
  // -----------------------------------------------------------------------
  describe('update()', () => {
    const dto: UpdateCategoryDto = { name: 'Design' };

    it('should update a category and invalidate cache', async () => {
      prisma.client.category.findUnique.mockResolvedValue(mockCategory);
      prisma.client.category.findFirst.mockResolvedValue(null);
      prisma.client.category.update.mockResolvedValue({
        ...mockCategory,
        name: 'Design',
      });
      cache.del.mockResolvedValue(undefined);

      await service.update(CATEGORY_UUID, dto);

      expect(prisma.client.category.update).toHaveBeenCalledWith({
        where: { id: mockCategory.id },
        data: { name: dto.name },
      });
      expect(cache.del).toHaveBeenCalledWith(`categories:${CATEGORY_UUID}`);
    });

    it('should throw NotFoundException when category does not exist', async () => {
      prisma.client.category.findUnique.mockResolvedValue(null);

      await expect(service.update(CATEGORY_UUID, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException for invalid UUID format', async () => {
      await expect(service.update(INVALID_UUID, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException when name is taken by another category', async () => {
      prisma.client.category.findUnique.mockResolvedValue(mockCategory);
      prisma.client.category.findFirst.mockResolvedValue({
        ...mockCategory,
        uuid: OTHER_UUID,
      });

      await expect(service.update(CATEGORY_UUID, dto)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.client.category.update).not.toHaveBeenCalled();
    });

    it('should allow update when the matching name belongs to the same category', async () => {
      prisma.client.category.findUnique.mockResolvedValue(mockCategory);
      prisma.client.category.findFirst.mockResolvedValue(mockCategory); // same uuid
      prisma.client.category.update.mockResolvedValue(mockCategory);
      cache.del.mockResolvedValue(undefined);

      await expect(
        service.update(CATEGORY_UUID, { name: mockCategory.name }),
      ).resolves.not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // remove()
  // -----------------------------------------------------------------------
  describe('remove()', () => {
    it('should soft-delete a category and invalidate cache', async () => {
      prisma.client.category.findUnique.mockResolvedValue(mockCategory);
      prisma.client.category.update.mockResolvedValue({
        ...mockCategory,
        deletedAt: new Date(),
      });
      cache.del.mockResolvedValue(undefined);

      await service.remove(CATEGORY_UUID);

      expect(prisma.client.category.update).toHaveBeenCalledWith({
        where: { id: mockCategory.id },
        data: { deletedAt: expect.any(Date) },
      });
      expect(cache.del).toHaveBeenCalledWith(`categories:${CATEGORY_UUID}`);
    });

    it('should throw NotFoundException when category does not exist', async () => {
      prisma.client.category.findUnique.mockResolvedValue(null);

      await expect(service.remove(CATEGORY_UUID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException for invalid UUID format', async () => {
      await expect(service.remove(INVALID_UUID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -----------------------------------------------------------------------
  // invalidateCache()
  // -----------------------------------------------------------------------
  describe('invalidateCache()', () => {
    it('should call cache.del with the correct key', async () => {
      cache.del.mockResolvedValue(undefined);

      await service.invalidateCache(CATEGORY_UUID);

      expect(cache.del).toHaveBeenCalledWith(`categories:${CATEGORY_UUID}`);
    });
  });
});
