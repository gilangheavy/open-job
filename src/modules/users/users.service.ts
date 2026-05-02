import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import type { User } from '@prisma/client';

const BCRYPT_ROUNDS = 10;
const CACHE_TTL = 3600; // 1 hour
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cacheKey = (uuid: string) => `users:${uuid}`;

export type FindByUuidResult = {
  data: UserResponseDto;
  source: 'cache' | 'database';
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async create(dto: CreateUserDto): Promise<UserResponseDto> {
    const existing = await this.prisma.client.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    try {
      const user = await this.prisma.client.user.create({
        data: {
          fullname: dto.fullname,
          email: dto.email,
          password: hashedPassword,
        },
      });

      return this.toResponse(user);
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        // Email exists but was soft-deleted — treat as conflict
        throw new ConflictException('Email already registered');
      }
      throw e;
    }
  }

  async findByUuid(uuid: string): Promise<FindByUuidResult> {
    // Treat invalid UUID format the same as not found to avoid leaking details
    if (!UUID_REGEX.test(uuid)) {
      throw new NotFoundException('User not found');
    }

    const cached = await this.cache.get<UserResponseDto>(cacheKey(uuid));
    if (cached) return { data: cached, source: 'cache' };

    const user = await this.prisma.client.user.findUnique({
      where: { uuid },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const response = this.toResponse(user);
    await this.cache.set(cacheKey(uuid), response, CACHE_TTL);
    return { data: response, source: 'database' };
  }

  async invalidateCache(uuid: string): Promise<void> {
    await this.cache.del(cacheKey(uuid));
  }

  private toResponse(user: User): UserResponseDto {
    return {
      id: user.uuid,
      fullname: user.fullname,
      email: user.email,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
