import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { CacheService } from './cache.service';

jest.mock('ioredis');

const mockRedis = {
  on: jest.fn(),
  quit: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  scan: jest.fn(),
};

describe('CacheService', () => {
  let service: CacheService;

  beforeEach(async () => {
    // Re-register the constructor implementation so it survives resetAllMocks()
    jest.mocked(Redis).mockImplementation(() => mockRedis as unknown as Redis);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              const config: Record<string, string | number> = {
                REDIS_HOST: 'localhost',
                REDIS_PORT: 6379,
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<CacheService>(CacheService);
    service.onModuleInit();
  });

  afterEach(() => jest.resetAllMocks());

  // -----------------------------------------------------------------------
  // onModuleInit()
  // -----------------------------------------------------------------------
  describe('onModuleInit()', () => {
    it('should initialise Redis client with host and port from config', () => {
      const Redis = jest.requireMock<jest.Mock>('ioredis');
      expect(Redis).toHaveBeenCalledWith(
        expect.objectContaining({ host: 'localhost', port: 6379 }),
      );
    });

    it('should register an error listener so connection errors are logged instead of crashing', () => {
      expect(mockRedis.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should not throw even when Redis host is unreachable (lazyConnect)', () => {
      expect(() => service.onModuleInit()).not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // onModuleDestroy()
  // -----------------------------------------------------------------------
  describe('onModuleDestroy()', () => {
    it('should call client.quit() on destroy', async () => {
      await service.onModuleDestroy();
      expect(mockRedis.quit).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // get()
  // -----------------------------------------------------------------------
  describe('get()', () => {
    it('should return parsed value on cache hit', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify({ name: 'test' }));

      const result = await service.get<{ name: string }>('some:key');

      expect(mockRedis.get).toHaveBeenCalledWith('some:key');
      expect(result).toEqual({ name: 'test' });
    });

    it('should return null on cache miss', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await service.get('missing:key');

      expect(result).toBeNull();
    });

    it('should return null and log a warning when Redis throws', async () => {
      const warnSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      mockRedis.get.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await service.get('some:key');

      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cache GET failed'),
      );
    });
  });

  // -----------------------------------------------------------------------
  // set()
  // -----------------------------------------------------------------------
  describe('set()', () => {
    it('should serialise the value and call client.set with correct EX ttl', async () => {
      mockRedis.set.mockResolvedValue('OK');

      await service.set('some:key', { name: 'test' }, 3600);

      expect(mockRedis.set).toHaveBeenCalledWith(
        'some:key',
        JSON.stringify({ name: 'test' }),
        'EX',
        3600,
      );
    });

    it('should not throw and should log a warning when Redis throws', async () => {
      const warnSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      mockRedis.set.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(service.set('some:key', {}, 3600)).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cache SET failed'),
      );
    });
  });

  // -----------------------------------------------------------------------
  // del()
  // -----------------------------------------------------------------------
  describe('del()', () => {
    it('should call client.del with the provided key', async () => {
      mockRedis.del.mockResolvedValue(1);

      await service.del('some:key');

      expect(mockRedis.del).toHaveBeenCalledWith('some:key');
    });

    it('should not throw and should log a warning when Redis throws', async () => {
      const warnSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      mockRedis.del.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(service.del('some:key')).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cache DEL failed'),
      );
    });
  });

  // -----------------------------------------------------------------------
  // delPattern()
  // -----------------------------------------------------------------------
  describe('delPattern()', () => {
    it('should scan and delete all keys matching the pattern', async () => {
      mockRedis.scan.mockResolvedValue(['0', ['key:1', 'key:2']]);
      mockRedis.del.mockResolvedValue(1);

      await service.delPattern('key:*');

      expect(mockRedis.scan).toHaveBeenCalledWith(
        '0',
        'MATCH',
        'key:*',
        'COUNT',
        100,
      );
      expect(mockRedis.del).toHaveBeenCalledWith('key:1');
      expect(mockRedis.del).toHaveBeenCalledWith('key:2');
    });

    it('should handle multiple scan pages (cursor != 0)', async () => {
      mockRedis.scan
        .mockResolvedValueOnce(['42', ['key:1']])
        .mockResolvedValueOnce(['0', ['key:2']]);
      mockRedis.del.mockResolvedValue(1);

      await service.delPattern('key:*');

      expect(mockRedis.scan).toHaveBeenCalledTimes(2);
      expect(mockRedis.del).toHaveBeenCalledTimes(2);
    });

    it('should do nothing when no keys match the pattern', async () => {
      mockRedis.scan.mockResolvedValue(['0', []]);

      await service.delPattern('nonexistent:*');

      expect(mockRedis.del).not.toHaveBeenCalled();
    });

    it('should not throw and should log a warning when Redis throws', async () => {
      const warnSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      mockRedis.scan.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(service.delPattern('key:*')).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cache DELPATTERN failed'),
      );
    });
  });
});
