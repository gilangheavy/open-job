import { Test, TestingModule } from '@nestjs/testing';
import { HealthIndicatorService } from '@nestjs/terminus';
import { PrismaHealthIndicator } from './prisma.health';
import { PrismaService } from '../../../prisma/prisma.service';

describe('PrismaHealthIndicator', () => {
  let indicator: PrismaHealthIndicator;
  let prismaService: jest.Mocked<Pick<PrismaService, '$queryRaw'>>;

  const mockSession = {
    up: jest.fn().mockReturnValue({ database: { status: 'up' } }),
    down: jest.fn().mockReturnValue({
      database: { status: 'down', message: 'Database is not reachable' },
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaHealthIndicator,
        {
          provide: PrismaService,
          useValue: {
            $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
          },
        },
        {
          provide: HealthIndicatorService,
          useValue: { check: jest.fn().mockReturnValue(mockSession) },
        },
      ],
    }).compile();

    indicator = module.get<PrismaHealthIndicator>(PrismaHealthIndicator);
    prismaService = module.get(PrismaService);

    jest.clearAllMocks();
    module.get(HealthIndicatorService).check.mockReturnValue(mockSession);
  });

  it('should be defined', () => {
    expect(indicator).toBeDefined();
  });

  describe('pingCheck()', () => {
    it('should return up status when DB is reachable', async () => {
      (prismaService.$queryRaw as jest.Mock).mockResolvedValue([
        { '?column?': 1 },
      ]);

      const result = await indicator.pingCheck('database');

      expect(mockSession.up).toHaveBeenCalled();
      expect(result).toEqual({ database: { status: 'up' } });
    });

    it('should return down status when DB throws', async () => {
      (prismaService.$queryRaw as jest.Mock).mockRejectedValue(
        new Error('connection refused'),
      );

      const result = await indicator.pingCheck('database');

      expect(mockSession.down).toHaveBeenCalledWith({
        message: 'Database is not reachable',
      });
      expect(result).toEqual({
        database: { status: 'down', message: 'Database is not reachable' },
      });
    });
  });
});
