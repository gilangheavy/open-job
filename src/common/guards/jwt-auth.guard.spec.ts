import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard, JwtPayload } from './jwt-auth.guard';

const VALID_PAYLOAD: JwtPayload = {
  id: '550e8400-e29b-41d4-a716-446655440000',
};
const ACCESS_SECRET = 'test-access-secret';

const buildContext = (authHeader?: string): ExecutionContext => {
  const request = {
    headers: authHeader ? { authorization: authHeader } : {},
    user: undefined as JwtPayload | undefined,
  };

  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
};

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let jwtService: jest.Mocked<JwtService>;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(() => {
    jwtService = {
      verify: jest.fn(),
    } as unknown as jest.Mocked<JwtService>;

    configService = {
      get: jest.fn().mockReturnValue(ACCESS_SECRET),
    } as unknown as jest.Mocked<ConfigService>;

    guard = new JwtAuthGuard(jwtService, configService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('canActivate()', () => {
    it('should return true and attach user to request when token is valid', () => {
      jwtService.verify.mockReturnValue(VALID_PAYLOAD);
      const ctx = buildContext(`Bearer valid.jwt.token`);

      const result = guard.canActivate(ctx);

      expect(result).toBe(true);
      expect(jwtService.verify).toHaveBeenCalledWith('valid.jwt.token', {
        secret: ACCESS_SECRET,
      });
      const req = ctx.switchToHttp().getRequest<{ user: JwtPayload }>();
      expect(req.user).toEqual(VALID_PAYLOAD);
    });

    it('should throw UnauthorizedException when Authorization header is missing', () => {
      const ctx = buildContext();

      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(ctx)).toThrow('Access token is required');
      expect(jwtService.verify).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when header does not start with "Bearer "', () => {
      const ctx = buildContext('Token abc123');

      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(ctx)).toThrow('Access token is required');
    });

    it('should throw UnauthorizedException when token is expired or invalid', () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });
      const ctx = buildContext('Bearer expired.jwt.token');

      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(ctx)).toThrow(
        'Invalid or expired access token',
      );
    });

    it('should use ACCESS_TOKEN_KEY from config to verify', () => {
      jwtService.verify.mockReturnValue(VALID_PAYLOAD);
      const ctx = buildContext('Bearer some.token');

      guard.canActivate(ctx);

      expect(configService.get).toHaveBeenCalledWith('ACCESS_TOKEN_KEY');
      expect(jwtService.verify).toHaveBeenCalledWith(
        'some.token',
        expect.objectContaining({ secret: ACCESS_SECRET }),
      );
    });
  });
});
