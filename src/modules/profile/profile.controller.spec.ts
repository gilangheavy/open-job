import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../../common/guards/jwt-auth.guard';
import type { UserResponseDto } from '../users/dto/user-response.dto';
import type { PaginatedResult } from './dto/pagination-query.dto';
import type { ProfileApplicationResponseDto } from './dto/profile-application-response.dto';
import type { ProfileBookmarkResponseDto } from './dto/profile-bookmark-response.dto';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const JOB_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const mockUser: JwtPayload = { id: VALID_UUID };

const mockUserResponse: UserResponseDto = {
  id: VALID_UUID,
  fullname: 'Jane Doe',
  email: 'jane@example.com',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const mockJobSummary = {
  id: JOB_UUID,
  title: 'Backend Engineer',
  location: 'Jakarta',
  type: 'full-time',
  salary: null,
};

const mockApplicationsPage: PaginatedResult<ProfileApplicationResponseDto> = {
  items: [
    {
      id: 'app-uuid-1111',
      status: 'pending',
      createdAt: new Date('2026-03-01T00:00:00Z'),
      job: mockJobSummary,
    },
  ],
  meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
};

const mockBookmarksPage: PaginatedResult<ProfileBookmarkResponseDto> = {
  items: [
    {
      id: 'bm-uuid-2222',
      createdAt: new Date('2026-03-02T00:00:00Z'),
      job: mockJobSummary,
    },
  ],
  meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
};

describe('ProfileController', () => {
  let controller: ProfileController;
  let service: jest.Mocked<ProfileService>;

  beforeEach(async () => {
    service = {
      getProfile: jest.fn(),
      getApplications: jest.fn(),
      getBookmarks: jest.fn(),
    } as unknown as jest.Mocked<ProfileService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProfileController],
      providers: [{ provide: ProfileService, useValue: service }],
    })
      // Bypass JwtAuthGuard — auth behaviour is tested in jwt-auth.guard.spec.ts
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ProfileController>(ProfileController);
  });

  afterEach(() => jest.clearAllMocks());

  // -----------------------------------------------------------------------
  // getProfile()
  // -----------------------------------------------------------------------
  describe('getProfile()', () => {
    it('should call service.getProfile with user UUID and return result', async () => {
      service.getProfile.mockResolvedValue(mockUserResponse);

      const result = await controller.getProfile(mockUser);

      expect(service.getProfile).toHaveBeenCalledWith(VALID_UUID);
      expect(result).toEqual(mockUserResponse);
    });

    it('should propagate NotFoundException from service', async () => {
      service.getProfile.mockRejectedValue(
        new NotFoundException('User not found'),
      );

      await expect(controller.getProfile(mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -----------------------------------------------------------------------
  // getApplications()
  // -----------------------------------------------------------------------
  describe('getApplications()', () => {
    it('should call service.getApplications with UUID and query, return paginated result', async () => {
      service.getApplications.mockResolvedValue(mockApplicationsPage);
      const query = { page: 1, limit: 10 };

      const result = await controller.getApplications(mockUser, query);

      expect(service.getApplications).toHaveBeenCalledWith(VALID_UUID, query);
      expect(result.items).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('should forward page and limit query params to service', async () => {
      service.getApplications.mockResolvedValue({
        items: [],
        meta: { total: 0, page: 2, limit: 5, totalPages: 0 },
      });
      const query = { page: 2, limit: 5 };

      await controller.getApplications(mockUser, query);

      expect(service.getApplications).toHaveBeenCalledWith(VALID_UUID, query);
    });
  });

  // -----------------------------------------------------------------------
  // getBookmarks()
  // -----------------------------------------------------------------------
  describe('getBookmarks()', () => {
    it('should call service.getBookmarks with UUID and query, return paginated result', async () => {
      service.getBookmarks.mockResolvedValue(mockBookmarksPage);
      const query = { page: 1, limit: 10 };

      const result = await controller.getBookmarks(mockUser, query);

      expect(service.getBookmarks).toHaveBeenCalledWith(VALID_UUID, query);
      expect(result.items).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('should forward page and limit query params to service', async () => {
      service.getBookmarks.mockResolvedValue({
        items: [],
        meta: { total: 0, page: 3, limit: 5, totalPages: 0 },
      });
      const query = { page: 3, limit: 5 };

      await controller.getBookmarks(mockUser, query);

      expect(service.getBookmarks).toHaveBeenCalledWith(VALID_UUID, query);
    });
  });
});
