import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BookmarksService } from './bookmarks.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { BookmarkResponseDto } from './dto/bookmark-response.dto';

const USER_UUID = '111e8400-e29b-41d4-a716-446655440001';
const OTHER_UUID = '222e8400-e29b-41d4-a716-446655440002';
const JOB_UUID = '330e8400-e29b-41d4-a716-446655440003';
const BOOKMARK_UUID = '440e8400-e29b-41d4-a716-446655440004';

const mockUser = {
  id: 1,
  uuid: USER_UUID,
  fullname: 'Test User',
  email: 'user@example.com',
  password: 'hashed',
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
  description: 'Build great things',
  location: 'Remote',
  salary: 10000000,
  type: 'Full-time',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  deletedAt: null,
};

const mockBookmark = {
  id: 1,
  uuid: BOOKMARK_UUID,
  userId: 1,
  jobId: 1,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  user: mockUser,
  job: mockJob,
};

const mockBookmarkResponse: BookmarkResponseDto = {
  id: BOOKMARK_UUID,
  jobId: JOB_UUID,
  userId: USER_UUID,
  createdAt: mockBookmark.createdAt,
  updatedAt: mockBookmark.updatedAt,
};

describe('BookmarksService', () => {
  let service: BookmarksService;
  let prisma: {
    client: {
      bookmark: {
        findMany: jest.Mock;
        count: jest.Mock;
        findUnique: jest.Mock;
        findFirst: jest.Mock;
        create: jest.Mock;
        delete: jest.Mock;
      };
      job: {
        findUnique: jest.Mock;
      };
      $executeRaw: jest.Mock;
    };
  };
  let cache: jest.Mocked<CacheService>;

  beforeEach(async () => {
    prisma = {
      client: {
        bookmark: {
          findMany: jest.fn(),
          count: jest.fn(),
          findUnique: jest.fn(),
          findFirst: jest.fn(),
          create: jest.fn(),
          delete: jest.fn(),
        },
        job: {
          findUnique: jest.fn(),
        },
        $executeRaw: jest.fn(),
      },
    };

    cache = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      delPattern: jest.fn(),
    } as unknown as jest.Mocked<CacheService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookmarksService,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheService, useValue: cache },
      ],
    }).compile();

    service = module.get<BookmarksService>(BookmarksService);
  });

  afterEach(() => jest.clearAllMocks());

  // -----------------------------------------------------------------------
  // create()
  // -----------------------------------------------------------------------
  describe('create()', () => {
    it('should create a bookmark and return BookmarkResponseDto', async () => {
      prisma.client.job.findUnique.mockResolvedValue(mockJob);
      prisma.client.bookmark.findFirst.mockResolvedValue(null);
      prisma.client.bookmark.create.mockResolvedValue(mockBookmark);

      const result = await service.create(USER_UUID, JOB_UUID);

      expect(prisma.client.bookmark.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            user: { connect: { uuid: USER_UUID } },
            job: { connect: { id: mockJob.id } },
          }),
          include: { user: true, job: true },
        }),
      );
      expect(result).toEqual(mockBookmarkResponse);
    });

    it('should invalidate user bookmarks cache after creation', async () => {
      prisma.client.job.findUnique.mockResolvedValue(mockJob);
      prisma.client.bookmark.findFirst.mockResolvedValue(null);
      prisma.client.bookmark.create.mockResolvedValue(mockBookmark);

      await service.create(USER_UUID, JOB_UUID);

      expect(cache.delPattern).toHaveBeenCalledWith(`bookmarks:${USER_UUID}:*`);
    });

    it('should throw NotFoundException when job does not exist', async () => {
      prisma.client.job.findUnique.mockResolvedValue(null);

      await expect(service.create(USER_UUID, JOB_UUID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when job is soft-deleted', async () => {
      prisma.client.job.findUnique.mockResolvedValue({
        ...mockJob,
        deletedAt: new Date(),
      });

      await expect(service.create(USER_UUID, JOB_UUID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException when bookmark already exists', async () => {
      prisma.client.job.findUnique.mockResolvedValue(mockJob);
      prisma.client.bookmark.findFirst.mockResolvedValue(mockBookmark);

      await expect(service.create(USER_UUID, JOB_UUID)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw NotFoundException for invalid jobUuid format', async () => {
      await expect(service.create(USER_UUID, 'not-a-uuid')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.client.job.findUnique).not.toHaveBeenCalled();
    });

    it('should not expose integer id in response', async () => {
      prisma.client.job.findUnique.mockResolvedValue(mockJob);
      prisma.client.bookmark.findFirst.mockResolvedValue(null);
      prisma.client.bookmark.create.mockResolvedValue(mockBookmark);

      const result = await service.create(USER_UUID, JOB_UUID);

      expect(result.id).toBe(BOOKMARK_UUID);
      expect(typeof result.id).toBe('string');
    });
  });

  // -----------------------------------------------------------------------
  // remove()
  // -----------------------------------------------------------------------
  describe('remove()', () => {
    it('should hard-delete the bookmark for the requesting user', async () => {
      prisma.client.bookmark.findFirst.mockResolvedValue(mockBookmark);
      prisma.client.$executeRaw.mockResolvedValue(1);

      await service.remove(USER_UUID, JOB_UUID);

      expect(prisma.client.$executeRaw).toHaveBeenCalled();
    });

    it('should invalidate user bookmarks cache after deletion', async () => {
      prisma.client.bookmark.findFirst.mockResolvedValue(mockBookmark);
      prisma.client.$executeRaw.mockResolvedValue(1);

      await service.remove(USER_UUID, JOB_UUID);

      expect(cache.delPattern).toHaveBeenCalledWith(`bookmarks:${USER_UUID}:*`);
    });

    it('should throw NotFoundException when bookmark does not exist', async () => {
      prisma.client.bookmark.findFirst.mockResolvedValue(null);

      await expect(service.remove(USER_UUID, JOB_UUID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when requester is not the bookmark owner', async () => {
      prisma.client.bookmark.findFirst.mockResolvedValue(mockBookmark);

      await expect(service.remove(OTHER_UUID, JOB_UUID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw NotFoundException for invalid jobUuid format', async () => {
      await expect(service.remove(USER_UUID, 'not-a-uuid')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.client.bookmark.findFirst).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // findByUuid()
  // -----------------------------------------------------------------------
  describe('findByUuid()', () => {
    it('should return bookmark response when found and user matches', async () => {
      prisma.client.bookmark.findUnique.mockResolvedValue(mockBookmark);

      const result = await service.findByUuid(BOOKMARK_UUID, USER_UUID);

      expect(result).toEqual(mockBookmarkResponse);
    });

    it('should throw ForbiddenException when requester is not the bookmark owner', async () => {
      prisma.client.bookmark.findUnique.mockResolvedValue(mockBookmark);

      await expect(
        service.findByUuid(BOOKMARK_UUID, OTHER_UUID),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when bookmark does not exist', async () => {
      prisma.client.bookmark.findUnique.mockResolvedValue(null);

      await expect(
        service.findByUuid(BOOKMARK_UUID, USER_UUID),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for invalid UUID format', async () => {
      await expect(
        service.findByUuid('not-a-uuid', USER_UUID),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.client.bookmark.findUnique).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // findAll()
  // -----------------------------------------------------------------------
  describe('findAll()', () => {
    it('should return cached bookmarks when present in Redis', async () => {
      const cachedList = {
        items: [mockBookmarkResponse],
        meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
      };
      cache.get.mockResolvedValue(cachedList);

      const result = await service.findAll(USER_UUID, { page: 1, limit: 10 });

      expect(cache.get).toHaveBeenCalledWith(
        `bookmarks:${USER_UUID}:p1:l10`,
      );
      expect(prisma.client.bookmark.findMany).not.toHaveBeenCalled();
      expect(result.data).toEqual(cachedList);
      expect(result.source).toBe('cache');
    });

    it('should fetch from DB, cache result, and return on cache miss', async () => {
      cache.get.mockResolvedValue(null);
      prisma.client.bookmark.findMany.mockResolvedValue([mockBookmark]);
      prisma.client.bookmark.count.mockResolvedValue(1);

      const result = await service.findAll(USER_UUID, { page: 1, limit: 10 });

      expect(cache.set).toHaveBeenCalledWith(
        `bookmarks:${USER_UUID}:p1:l10`,
        expect.objectContaining({ items: [mockBookmarkResponse] }),
        3600,
      );
      expect(result.source).toBe('database');
    });

    it('should return correct pagination meta', async () => {
      cache.get.mockResolvedValue(null);
      prisma.client.bookmark.findMany.mockResolvedValue([mockBookmark]);
      prisma.client.bookmark.count.mockResolvedValue(25);

      const result = await service.findAll(USER_UUID, { page: 2, limit: 10 });

      expect(result.data.meta).toEqual({
        total: 25,
        page: 2,
        limit: 10,
        totalPages: 3,
      });
    });

    it('should not expose integer id in list response items', async () => {
      cache.get.mockResolvedValue(null);
      prisma.client.bookmark.findMany.mockResolvedValue([mockBookmark]);
      prisma.client.bookmark.count.mockResolvedValue(1);

      const result = await service.findAll(USER_UUID, { page: 1, limit: 10 });

      expect(result.data.items[0].id).toBe(BOOKMARK_UUID);
      expect(typeof result.data.items[0].id).toBe('string');
    });
  });
});
