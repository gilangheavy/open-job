import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { CreateUserDto } from './dto/create-user.dto';

jest.mock('bcrypt');

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

const mockUser = {
  id: 1,
  uuid: VALID_UUID,
  fullname: 'John Doe',
  email: 'john@example.com',
  password: '$2b$10$hashedpassword',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  deletedAt: null,
};

const mockUserResponse = {
  id: mockUser.uuid,
  fullname: mockUser.fullname,
  email: mockUser.email,
  createdAt: mockUser.createdAt,
  updatedAt: mockUser.updatedAt,
};

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    client: { user: jest.Mocked<{ findUnique: jest.Mock; create: jest.Mock }> };
  };
  let cache: jest.Mocked<CacheService>;

  beforeEach(async () => {
    prisma = {
      client: {
        user: {
          findUnique: jest.fn(),
          create: jest.fn(),
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
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheService, useValue: cache },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create()', () => {
    const dto: CreateUserDto = {
      fullname: 'John Doe',
      email: 'john@example.com',
      password: 'password123',
    };

    it('should create a user and return UserResponseDto', async () => {
      prisma.client.user.findUnique.mockResolvedValue(null);
      prisma.client.user.create.mockResolvedValue(mockUser);
      (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$hashedpassword');

      const result = await service.create(dto);

      expect(prisma.client.user.findUnique).toHaveBeenCalledWith({
        where: { email: dto.email },
      });
      expect(bcrypt.hash).toHaveBeenCalledWith(dto.password, 10);
      expect(prisma.client.user.create).toHaveBeenCalledWith({
        data: {
          fullname: dto.fullname,
          email: dto.email,
          password: '$2b$10$hashedpassword',
        },
      });
      expect(result).toEqual(mockUserResponse);
    });

    it('should throw ConflictException when email already exists', async () => {
      prisma.client.user.findUnique.mockResolvedValue(mockUser);

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      expect(prisma.client.user.create).not.toHaveBeenCalled();
    });

    it('should not expose password or integer id in response', async () => {
      prisma.client.user.findUnique.mockResolvedValue(null);
      prisma.client.user.create.mockResolvedValue(mockUser);
      (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$hashedpassword');

      const result = await service.create(dto);

      expect(result).not.toHaveProperty('password');
      expect((result as unknown as Record<string, unknown>)['id']).toBe(
        mockUser.uuid,
      );
      expect(typeof result.id).toBe('string');
    });
  });

  describe('findByUuid()', () => {
    it('should return cached user if present in Redis', async () => {
      cache.get.mockResolvedValue(mockUserResponse);

      const result = await service.findByUuid(VALID_UUID);

      expect(cache.get).toHaveBeenCalledWith(`users:${VALID_UUID}`);
      expect(prisma.client.user.findUnique).not.toHaveBeenCalled();
      expect(result.data).toEqual(mockUserResponse);
      expect(result.source).toBe('cache');
    });

    it('should fetch from DB and cache result on cache miss', async () => {
      cache.get.mockResolvedValue(null);
      prisma.client.user.findUnique.mockResolvedValue(mockUser);
      cache.set.mockResolvedValue(undefined);

      const result = await service.findByUuid(VALID_UUID);

      expect(prisma.client.user.findUnique).toHaveBeenCalledWith({
        where: { uuid: VALID_UUID },
      });
      expect(cache.set).toHaveBeenCalledWith(
        `users:${VALID_UUID}`,
        mockUserResponse,
        3600,
      );
      expect(result.data).toEqual(mockUserResponse);
      expect(result.source).toBe('database');
    });

    it('should throw NotFoundException when user not found in DB', async () => {
      cache.get.mockResolvedValue(null);
      prisma.client.user.findUnique.mockResolvedValue(null);

      await expect(service.findByUuid(VALID_UUID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException for invalid UUID format (e.g. "xxx")', async () => {
      await expect(service.findByUuid('xxx')).rejects.toThrow(
        NotFoundException,
      );
      expect(cache.get).not.toHaveBeenCalled();
      expect(prisma.client.user.findUnique).not.toHaveBeenCalled();
    });

    it('should not expose password or integer id in result', async () => {
      cache.get.mockResolvedValue(null);
      prisma.client.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.findByUuid(VALID_UUID);

      expect(result.data).not.toHaveProperty('password');
      expect(result.data.id).toBe(mockUser.uuid);
    });
  });

  describe('invalidateCache()', () => {
    it('should delete cache key for given uuid', async () => {
      cache.del.mockResolvedValue(undefined);

      await service.invalidateCache(VALID_UUID);

      expect(cache.del).toHaveBeenCalledWith(`users:${VALID_UUID}`);
    });
  });
});
