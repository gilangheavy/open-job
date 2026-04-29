import { Test, TestingModule } from '@nestjs/testing';
import { HealthIndicatorService } from '@nestjs/terminus';
import * as net from 'net';
import { TcpHealthIndicator } from './tcp.health';

jest.mock('net');

describe('TcpHealthIndicator', () => {
  let indicator: TcpHealthIndicator;

  const mockSession = {
    up: jest.fn().mockReturnValue({ redis: { status: 'up' } }),
    down: jest.fn().mockReturnValue({
      redis: { status: 'down', message: 'redis is not reachable' },
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TcpHealthIndicator,
        {
          provide: HealthIndicatorService,
          useValue: { check: jest.fn().mockReturnValue(mockSession) },
        },
      ],
    }).compile();

    indicator = module.get<TcpHealthIndicator>(TcpHealthIndicator);

    jest.clearAllMocks();
    (module.get(HealthIndicatorService).check as jest.Mock).mockReturnValue(
      mockSession,
    );
  });

  it('should be defined', () => {
    expect(indicator).toBeDefined();
  });

  describe('pingCheck()', () => {
    it('should return up status when TCP connection succeeds', async () => {
      const mockSocket = {
        setTimeout: jest.fn(),
        on: jest.fn().mockImplementation(function (
          this: typeof mockSocket,
          event: string,
          cb: () => void,
        ) {
          if (event === 'connect') setImmediate(cb);
          return this;
        }),
        connect: jest.fn(),
        destroy: jest.fn(),
      };
      (net.Socket as unknown as jest.Mock).mockImplementation(() => mockSocket);

      const result = await indicator.pingCheck('redis', 'localhost', 6379);

      expect(mockSession.up).toHaveBeenCalled();
      expect(result).toEqual({ redis: { status: 'up' } });
    });

    it('should return down status when TCP connection fails', async () => {
      const mockSocket = {
        setTimeout: jest.fn(),
        on: jest.fn().mockImplementation(function (
          this: typeof mockSocket,
          event: string,
          cb: () => void,
        ) {
          if (event === 'error') setImmediate(cb);
          return this;
        }),
        connect: jest.fn(),
        destroy: jest.fn(),
      };
      (net.Socket as unknown as jest.Mock).mockImplementation(() => mockSocket);

      const result = await indicator.pingCheck('redis', 'localhost', 6379);

      expect(mockSession.down).toHaveBeenCalledWith({
        message: 'redis is not reachable',
      });
      expect(result).toEqual({
        redis: { status: 'down', message: 'redis is not reachable' },
      });
    });

    it('should return down status on TCP timeout', async () => {
      const mockSocket = {
        setTimeout: jest.fn(),
        on: jest.fn().mockImplementation(function (
          this: typeof mockSocket,
          event: string,
          cb: () => void,
        ) {
          if (event === 'timeout') setImmediate(cb);
          return this;
        }),
        connect: jest.fn(),
        destroy: jest.fn(),
      };
      (net.Socket as unknown as jest.Mock).mockImplementation(() => mockSocket);

      const result = await indicator.pingCheck('redis', 'localhost', 6379);

      expect(mockSession.down).toHaveBeenCalledWith({
        message: 'redis is not reachable',
      });
      expect(result).toEqual({
        redis: { status: 'down', message: 'redis is not reachable' },
      });
    });
  });
});
