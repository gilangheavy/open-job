import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { BookmarksController } from './bookmarks.controller';
import { BookmarksService } from './bookmarks.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../../common/guards/jwt-auth.guard';
import { BookmarkResponseDto } from './dto/bookmark-response.dto';
import type { PaginatedResult } from '../profile/dto/pagination-query.dto';

const USER_UUID = '111e8400-e29b-41d4-a716-446655440001';
const JOB_UUID = '330e8400-e29b-41d4-a716-446655440003';
const BOOKMARK_UUID = '440e8400-e29b-41d4-a716-446655440004';

const mockUser: JwtPayload = { id: USER_UUID };

const mockBookmarkResponse: BookmarkResponseDto = {
  id: BOOKMARK_UUID,
  jobId: JOB_UUID,
  userId: USER_UUID,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const mockPaginatedResult: PaginatedResult<BookmarkResponseDto> = {
  items: [mockBookmarkResponse],
  meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
};

const mockRes = {
  header: jest.fn(),
} as unknown as Response;

describe('BookmarksController', () => {
  let controller: BookmarksController;
  let service: jest.Mocked<BookmarksService>;

  beforeEach(async () => {
    service = {
      create: jest.fn(),
      remove: jest.fn(),
      findByUuid: jest.fn(),
      findAll: jest.fn(),
    } as unknown as jest.Mocked<BookmarksService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BookmarksController],
      providers: [
        { provide: BookmarksService, useValue: service },
        { provide: JwtAuthGuard, useValue: { canActivate: () => true } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BookmarksController>(BookmarksController);
  });

  afterEach(() => jest.clearAllMocks());

  // -----------------------------------------------------------------------
  // POST /jobs/:jobId/bookmark
  // -----------------------------------------------------------------------
  describe('create()', () => {
    it('should call service.create and return BookmarkResponseDto', async () => {
      service.create.mockResolvedValue(mockBookmarkResponse);

      const result = await controller.create(mockUser, JOB_UUID);

      expect(service.create).toHaveBeenCalledWith(USER_UUID, JOB_UUID);
      expect(result).toEqual(mockBookmarkResponse);
    });

    it('should propagate NotFoundException from service', async () => {
      service.create.mockRejectedValue(new NotFoundException('Job not found'));

      await expect(controller.create(mockUser, JOB_UUID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should propagate ConflictException from service', async () => {
      service.create.mockRejectedValue(
        new ConflictException('Already bookmarked'),
      );

      await expect(controller.create(mockUser, JOB_UUID)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // -----------------------------------------------------------------------
  // DELETE /jobs/:jobId/bookmark
  // -----------------------------------------------------------------------
  describe('remove()', () => {
    it('should call service.remove and return success message', async () => {
      service.remove.mockResolvedValue(undefined);

      const result = await controller.remove(mockUser, JOB_UUID);

      expect(service.remove).toHaveBeenCalledWith(USER_UUID, JOB_UUID);
      expect(result).toEqual({
        status: 'success',
        message: 'Bookmark deleted successfully',
      });
    });

    it('should propagate ForbiddenException from service', async () => {
      service.remove.mockRejectedValue(
        new ForbiddenException('Not your bookmark'),
      );

      await expect(controller.remove(mockUser, JOB_UUID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should propagate NotFoundException from service', async () => {
      service.remove.mockRejectedValue(
        new NotFoundException('Bookmark not found'),
      );

      await expect(controller.remove(mockUser, JOB_UUID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -----------------------------------------------------------------------
  // GET /jobs/:jobId/bookmark/:id
  // -----------------------------------------------------------------------
  describe('findOne()', () => {
    it('should call service.findByUuid and return BookmarkResponseDto', async () => {
      service.findByUuid.mockResolvedValue(mockBookmarkResponse);

      const result = await controller.findOne(mockUser, JOB_UUID, BOOKMARK_UUID);

      expect(service.findByUuid).toHaveBeenCalledWith(BOOKMARK_UUID, USER_UUID);
      expect(result).toEqual(mockBookmarkResponse);
    });

    it('should propagate NotFoundException from service', async () => {
      service.findByUuid.mockRejectedValue(
        new NotFoundException('Bookmark not found'),
      );

      await expect(
        controller.findOne(mockUser, JOB_UUID, BOOKMARK_UUID),
      ).rejects.toThrow(NotFoundException);
    });

    it('should propagate ForbiddenException from service', async () => {
      service.findByUuid.mockRejectedValue(
        new ForbiddenException('No access'),
      );

      await expect(
        controller.findOne(mockUser, JOB_UUID, BOOKMARK_UUID),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // -----------------------------------------------------------------------
  // GET /bookmarks
  // -----------------------------------------------------------------------
  describe('getAll()', () => {
    it('should return paginated bookmarks and set X-Data-Source header from DB', async () => {
      service.findAll.mockResolvedValue({
        data: mockPaginatedResult,
        source: 'database',
      });

      const result = await controller.getAll(
        mockUser,
        { page: 1, limit: 10 },
        mockRes,
      );

      expect(service.findAll).toHaveBeenCalledWith(USER_UUID, {
        page: 1,
        limit: 10,
      });
      expect(mockRes.header).toHaveBeenCalledWith('X-Data-Source', 'database');
      expect(result).toEqual(mockPaginatedResult);
    });

    it('should set X-Data-Source: cache header on cache hit', async () => {
      service.findAll.mockResolvedValue({
        data: mockPaginatedResult,
        source: 'cache',
      });

      await controller.getAll(mockUser, { page: 1, limit: 10 }, mockRes);

      expect(mockRes.header).toHaveBeenCalledWith('X-Data-Source', 'cache');
    });
  });
});
