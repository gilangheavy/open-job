import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import type { EnvConfig } from '../../config/env.config';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AccessTokenResponse {
  accessToken: string;
}

@Injectable()
export class AuthenticationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async login(dto: LoginDto): Promise<TokenPair> {
    const user = await this.prisma.client.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatch = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const payload = { id: user.uuid };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.config.get('ACCESS_TOKEN_KEY'),
      expiresIn: '3h',
    });

    const refreshToken = this.jwtService.sign(
      { id: payload.id, jti: randomUUID() },
      {
        secret: this.config.get('REFRESH_TOKEN_KEY'),
      },
    );

    await this.prisma.client.authentication.create({
      data: {
        token: refreshToken,
        userId: user.id,
      },
    });

    return { accessToken, refreshToken };
  }

  async refresh(dto: RefreshTokenDto): Promise<AccessTokenResponse> {
    // Verify token signature first
    let payload: { id: string };
    try {
      payload = this.jwtService.verify<{ id: string }>(dto.refreshToken, {
        secret: this.config.get('REFRESH_TOKEN_KEY'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Check token exists in DB (stateful revocation check)
    const stored = await this.prisma.client.authentication.findUnique({
      where: { token: dto.refreshToken },
    });

    if (!stored) {
      throw new UnauthorizedException('Refresh token not found');
    }

    const accessToken = this.jwtService.sign(
      { id: payload.id },
      {
        secret: this.config.get('ACCESS_TOKEN_KEY'),
        expiresIn: '3h',
      },
    );

    return { accessToken };
  }

  async logout(dto: LogoutDto): Promise<void> {
    // Hard delete the refresh token — no existence check needed;
    // deleteMany is used to avoid throwing if token is already gone.
    await this.prisma.client.authentication.deleteMany({
      where: { token: dto.refreshToken },
    });
  }
}
