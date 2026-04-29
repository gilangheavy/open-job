import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UserResponseDto } from './dto/user-response.dto';

const mockUserResponse: UserResponseDto = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  fullname: 'John Doe',
  email: 'john@example.com',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const mockFindResult = { data: mockUserResponse, source: 'database' as const };

const mockRes = {
  header: jest.fn(),
} as unknown as Response;

describe('UsersController', () => {
  let controller: UsersController;
  let service: jest.Mocked<UsersService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: {
            create: jest.fn(),
            findByUuid: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    service = module.get(UsersService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('register()', () => {
    const dto: CreateUserDto = {
      fullname: 'John Doe',
      email: 'john@example.com',
      password: 'password123',
    };

    it('should create a user and return UserResponseDto', async () => {
      service.create.mockResolvedValue(mockUserResponse);

      const result = await controller.register(dto);

      expect(service.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockUserResponse);
    });

    it('should propagate ConflictException from service', async () => {
      service.create.mockRejectedValue(
        new ConflictException('Email already registered'),
      );

      await expect(controller.register(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('getProfile()', () => {
    const uuid = mockUserResponse.id;

    it('should return public user profile by UUID and set X-Data-Source header', async () => {
      service.findByUuid.mockResolvedValue(mockFindResult);

      const result = await controller.getProfile(uuid, mockRes);

      expect(service.findByUuid).toHaveBeenCalledWith(uuid);
      expect(mockRes.header).toHaveBeenCalledWith('X-Data-Source', 'database');
      expect(result).toEqual(mockUserResponse);
    });

    it('should set X-Data-Source: cache when served from Redis', async () => {
      service.findByUuid.mockResolvedValue({
        data: mockUserResponse,
        source: 'cache',
      });

      await controller.getProfile(uuid, mockRes);

      expect(mockRes.header).toHaveBeenCalledWith('X-Data-Source', 'cache');
    });

    it('should propagate NotFoundException from service', async () => {
      service.findByUuid.mockRejectedValue(
        new NotFoundException('User not found'),
      );

      await expect(controller.getProfile(uuid, mockRes)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return id as UUID string, not integer', async () => {
      service.findByUuid.mockResolvedValue(mockFindResult);

      const result = await controller.getProfile(uuid, mockRes);

      expect(typeof result.id).toBe('string');
      expect(result.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });
  });
});
