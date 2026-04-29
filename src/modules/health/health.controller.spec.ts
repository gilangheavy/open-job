import { Test, TestingModule } from '@nestjs/testing';
import { HealthCheckService } from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
import { HealthController } from './health.controller';
import { PrismaHealthIndicator } from './indicators/prisma.health';
import { TcpHealthIndicator } from './indicators/tcp.health';

describe('HealthController', () => {
  let controller: HealthController;
  let healthCheckService: jest.Mocked<HealthCheckService>;
  let prismaIndicator: jest.Mocked<PrismaHealthIndicator>;
  let tcpIndicator: jest.Mocked<TcpHealthIndicator>;

  const mockHealthResult = {
    status: 'ok',
    info: {
      database: { status: 'up' },
      redis: { status: 'up' },
      rabbitmq: { status: 'up' },
    },
    error: {},
    details: {
      database: { status: 'up' },
      redis: { status: 'up' },
      rabbitmq: { status: 'up' },
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthCheckService,
          useValue: { check: jest.fn().mockResolvedValue(mockHealthResult) },
        },
        {
          provide: PrismaHealthIndicator,
          useValue: { pingCheck: jest.fn() },
        },
        {
          provide: TcpHealthIndicator,
          useValue: { pingCheck: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              const config: Record<string, string | number> = {
                REDIS_HOST: 'localhost',
                REDIS_PORT: 6379,
                RABBITMQ_HOST: 'localhost',
                RABBITMQ_PORT: 5672,
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    healthCheckService = module.get(HealthCheckService);
    prismaIndicator = module.get(PrismaHealthIndicator);
    tcpIndicator = module.get(TcpHealthIndicator);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('check()', () => {
    it('should call health.check with three indicators', async () => {
      await controller.check();

      expect(healthCheckService.check).toHaveBeenCalledWith([
        expect.any(Function),
        expect.any(Function),
        expect.any(Function),
      ]);
    });

    it('should return terminus health result', async () => {
      const result = await controller.check();
      expect(result).toEqual(mockHealthResult);
    });

    it('should call db.pingCheck with "database" key', async () => {
      await controller.check();

      const [indicators] = healthCheckService.check.mock.calls[0] as [
        Array<() => Promise<unknown>>,
      ];
      await indicators[0]();

      expect(prismaIndicator.pingCheck).toHaveBeenCalledWith('database');
    });

    it('should call tcp.pingCheck for redis and rabbitmq', async () => {
      await controller.check();

      const [indicators] = healthCheckService.check.mock.calls[0] as [
        Array<() => Promise<unknown>>,
      ];
      await indicators[1]();
      await indicators[2]();

      expect(tcpIndicator.pingCheck).toHaveBeenCalledWith(
        'redis',
        'localhost',
        6379,
      );
      expect(tcpIndicator.pingCheck).toHaveBeenCalledWith(
        'rabbitmq',
        'localhost',
        5672,
      );
    });
  });
});
