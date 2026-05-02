import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import type { UserResponseDto } from '../users/dto/user-response.dto';
import type { PaginationQueryDto } from './dto/pagination-query.dto';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const JOB_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const mockUserResponse: UserResponseDto = {
  id: VALID_UUID,
  fullname: 'Jane Doe',
  email: 'jane@example.com',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const mockJob = {
  uuid: JOB_UUID,
  title: 'Backend Engineer',
  location: 'Jakarta',
  type: 'full-time',
  salary: null,
};

const mockApplication = {
  uuid: 'app-uuid-1111',
  status: 'pending',
  createdAt: new Date('2026-03-01T00:00:00Z'),
  job: mockJob,
};

const mockBookmark = {
  uuid: 'bm-uuid-2222',
  createdAt: new Date('2026-03-02T00:00:00Z'),
  job: mockJob,
};

const defaultQuery: PaginationQueryDto = { page: 1, limit: 10 };

describe('ProfileService', () => {
  let service: ProfileService;
  let usersService: jest.Mocked<UsersService>;
  let prisma: {
    client: {
      application: {
        findMany: jest.Mock;
        count: jest.Mock;
      };
      bookmark: {
        findMany: jest.Mock;
        count: jest.Mock;
      };
    };
  };

  beforeEach(async () => {
    usersService = {
      findByUuid: jest.fn(),
    } as unknown as jest.Mocked<UsersService>;

    prisma = {
      client: {
        application: { findMany: jest.fn(), count: jest.fn() },
        bookmark: { findMany: jest.fn(), count: jest.fn() },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfileService,
        { provide: PrismaService, useValue: prisma },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();

    service = module.get<ProfileService>(ProfileService);
  });

  afterEach(() => jest.clearAllMocks());

  // -----------------------------------------------------------------------
  // getProfile()
  // -----------------------------------------------------------------------
  describe('getProfile()', () => {
    it('should return the user profile for a given UUID', async () => {
      usersService.findByUuid.mockResolvedValue({
        data: mockUserResponse,
        source: 'database',
      });

      const result = await service.getProfile(VALID_UUID);

      expect(usersService.findByUuid).toHaveBeenCalledWith(VALID_UUID);
      expect(result).toEqual(mockUserResponse);
    });

    it('should propagate NotFoundException from UsersService', async () => {
      usersService.findByUuid.mockRejectedValue(
        new NotFoundException('User not found'),
      );

      await expect(service.getProfile(VALID_UUID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -----------------------------------------------------------------------
  // getApplications()
  // -----------------------------------------------------------------------
  describe('getApplications()', () => {
    it('should return paginated applications for the user', async () => {
      prisma.client.application.findMany.mockResolvedValue([mockApplication]);
      prisma.client.application.count.mockResolvedValue(1);

      const result = await service.getApplications(VALID_UUID, defaultQuery);

      expect(prisma.client.application.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user: { uuid: VALID_UUID } },
          skip: 0,
          take: 10,
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe(mockApplication.uuid);
      expect(result.items[0].status).toBe('pending');
      expect(result.items[0].job.id).toBe(JOB_UUID);
    });

    it('should return correct pagination meta', async () => {
      prisma.client.application.findMany.mockResolvedValue([mockApplication]);
      prisma.client.application.count.mockResolvedValue(25);

      const result = await service.getApplications(VALID_UUID, {
        page: 2,
        limit: 10,
      });

      expect(result.meta).toEqual({
        total: 25,
        page: 2,
        limit: 10,
        totalPages: 3,
      });
    });

    it('should use correct skip for page > 1', async () => {
      prisma.client.application.findMany.mockResolvedValue([]);
      prisma.client.application.count.mockResolvedValue(0);

      await service.getApplications(VALID_UUID, { page: 3, limit: 5 });

      expect(prisma.client.application.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 5 }),
      );
    });

    it('should return empty items and total=0 when user has no applications', async () => {
      prisma.client.application.findMany.mockResolvedValue([]);
      prisma.client.application.count.mockResolvedValue(0);

      const result = await service.getApplications(VALID_UUID, defaultQuery);

      expect(result.items).toHaveLength(0);
      expect(result.meta.total).toBe(0);
      expect(result.meta.totalPages).toBe(0);
    });

    it('should convert Decimal salary to string', async () => {
      const appWithSalary = {
        ...mockApplication,
        job: { ...mockJob, salary: { toString: () => '5000000.00' } },
      };
      prisma.client.application.findMany.mockResolvedValue([appWithSalary]);
      prisma.client.application.count.mockResolvedValue(1);

      const result = await service.getApplications(VALID_UUID, defaultQuery);

      expect(result.items[0].job.salary).toBe('5000000.00');
    });
  });

  // -----------------------------------------------------------------------
  // getBookmarks()
  // -----------------------------------------------------------------------
  describe('getBookmarks()', () => {
    it('should return paginated bookmarks for the user', async () => {
      prisma.client.bookmark.findMany.mockResolvedValue([mockBookmark]);
      prisma.client.bookmark.count.mockResolvedValue(1);

      const result = await service.getBookmarks(VALID_UUID, defaultQuery);

      expect(prisma.client.bookmark.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user: { uuid: VALID_UUID } },
          skip: 0,
          take: 10,
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe(mockBookmark.uuid);
      expect(result.items[0].job.id).toBe(JOB_UUID);
    });

    it('should return correct pagination meta', async () => {
      prisma.client.bookmark.findMany.mockResolvedValue([mockBookmark]);
      prisma.client.bookmark.count.mockResolvedValue(15);

      const result = await service.getBookmarks(VALID_UUID, {
        page: 1,
        limit: 5,
      });

      expect(result.meta).toEqual({
        total: 15,
        page: 1,
        limit: 5,
        totalPages: 3,
      });
    });

    it('should return empty items when user has no bookmarks', async () => {
      prisma.client.bookmark.findMany.mockResolvedValue([]);
      prisma.client.bookmark.count.mockResolvedValue(0);

      const result = await service.getBookmarks(VALID_UUID, defaultQuery);

      expect(result.items).toHaveLength(0);
      expect(result.meta.totalPages).toBe(0);
    });
  });
});
