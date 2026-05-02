import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CategoryResponseDto } from './dto/category-response.dto';
import type { PaginatedResult } from '../profile/dto/pagination-query.dto';

const CATEGORY_UUID = '550e8400-e29b-41d4-a716-446655440000';

const mockCategoryResponse: CategoryResponseDto = {
  id: CATEGORY_UUID,
  name: 'Engineering',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const mockFindResult = {
  data: mockCategoryResponse,
  source: 'database' as const,
};

const mockPaginatedResult: PaginatedResult<CategoryResponseDto> = {
  items: [mockCategoryResponse],
  meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
};

const mockRes = {
  header: jest.fn(),
} as unknown as Response;

describe('CategoriesController', () => {
  let controller: CategoriesController;
  let service: jest.Mocked<CategoriesService>;

  beforeEach(async () => {
    service = {
      create: jest.fn(),
      findAll: jest.fn(),
      findByUuid: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      invalidateCache: jest.fn(),
    } as unknown as jest.Mocked<CategoriesService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CategoriesController],
      providers: [{ provide: CategoriesService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CategoriesController>(CategoriesController);
  });

  afterEach(() => jest.clearAllMocks());

  // -----------------------------------------------------------------------
  // GET /categories
  // -----------------------------------------------------------------------
  describe('getAll()', () => {
    it('should return a paginated list of categories', async () => {
      service.findAll.mockResolvedValue(mockPaginatedResult);

      const result = await controller.getAll({ page: 1, limit: 10 });

      expect(service.findAll).toHaveBeenCalledWith({ page: 1, limit: 10 });
      expect(result).toEqual(mockPaginatedResult);
    });
  });

  // -----------------------------------------------------------------------
  // GET /categories/:uuid
  // -----------------------------------------------------------------------
  describe('getById()', () => {
    it('should return the category and set X-Data-Source header', async () => {
      service.findByUuid.mockResolvedValue(mockFindResult);

      const result = await controller.getById(CATEGORY_UUID, mockRes);

      expect(service.findByUuid).toHaveBeenCalledWith(CATEGORY_UUID);
      expect(mockRes.header).toHaveBeenCalledWith('X-Data-Source', 'database');
      expect(result).toEqual(mockCategoryResponse);
    });

    it('should set X-Data-Source to "cache" when served from cache', async () => {
      service.findByUuid.mockResolvedValue({
        ...mockFindResult,
        source: 'cache',
      });

      await controller.getById(CATEGORY_UUID, mockRes);

      expect(mockRes.header).toHaveBeenCalledWith('X-Data-Source', 'cache');
    });

    it('should propagate NotFoundException from service', async () => {
      service.findByUuid.mockRejectedValue(new NotFoundException());

      await expect(controller.getById(CATEGORY_UUID, mockRes)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -----------------------------------------------------------------------
  // POST /categories
  // -----------------------------------------------------------------------
  describe('create()', () => {
    const dto: CreateCategoryDto = { name: 'Engineering' };

    it('should create and return a category', async () => {
      service.create.mockResolvedValue(mockCategoryResponse);

      const result = await controller.create(dto);

      expect(service.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockCategoryResponse);
    });

    it('should propagate ConflictException from service', async () => {
      service.create.mockRejectedValue(new ConflictException());

      await expect(controller.create(dto)).rejects.toThrow(ConflictException);
    });
  });

  // -----------------------------------------------------------------------
  // PUT /categories/:uuid
  // -----------------------------------------------------------------------
  describe('update()', () => {
    const dto: UpdateCategoryDto = { name: 'Design' };

    it('should update and return success message', async () => {
      service.update.mockResolvedValue(undefined);

      const result = await controller.update(CATEGORY_UUID, dto);

      expect(service.update).toHaveBeenCalledWith(CATEGORY_UUID, dto);
      expect(result).toEqual({
        status: 'success',
        message: 'Category updated successfully',
      });
    });

    it('should propagate NotFoundException from service', async () => {
      service.update.mockRejectedValue(new NotFoundException());

      await expect(controller.update(CATEGORY_UUID, dto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -----------------------------------------------------------------------
  // DELETE /categories/:uuid
  // -----------------------------------------------------------------------
  describe('remove()', () => {
    it('should soft-delete and return success message', async () => {
      service.remove.mockResolvedValue(undefined);

      const result = await controller.remove(CATEGORY_UUID);

      expect(service.remove).toHaveBeenCalledWith(CATEGORY_UUID);
      expect(result).toEqual({
        status: 'success',
        message: 'Category deleted successfully',
      });
    });

    it('should propagate NotFoundException from service', async () => {
      service.remove.mockRejectedValue(new NotFoundException());

      await expect(controller.remove(CATEGORY_UUID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
