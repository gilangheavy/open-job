import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as amqplib from 'amqplib';
import { QueueService } from './queue.service';

jest.mock('amqplib');

const EXCHANGE_NAME = 'openjob.events';
const QUEUE_NAME = 'application.created';
const DLQ_NAME = 'application.created.dlq';

describe('QueueService', () => {
  let service: QueueService;
  let mockChannel: jest.Mocked<amqplib.Channel>;
  let mockConnection: jest.Mocked<amqplib.ChannelModel>;

  beforeEach(async () => {
    mockChannel = {
      assertExchange: jest.fn().mockResolvedValue(undefined),
      assertQueue: jest.fn().mockResolvedValue(undefined),
      bindQueue: jest.fn().mockResolvedValue(undefined),
      publish: jest.fn().mockReturnValue(true),
      close: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<amqplib.Channel>;

    mockConnection = {
      createChannel: jest.fn().mockResolvedValue(mockChannel),
      close: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<amqplib.ChannelModel>;

    (amqplib.connect as jest.Mock).mockResolvedValue(mockConnection);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, string | number> = {
                RABBITMQ_HOST: 'localhost',
                RABBITMQ_PORT: 5672,
                RABBITMQ_USER: 'guest',
                RABBITMQ_PASSWORD: 'guest',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<QueueService>(QueueService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('onModuleInit', () => {
    it('should connect to RabbitMQ and assert exchange', async () => {
      await service.onModuleInit();

      expect(amqplib.connect).toHaveBeenCalledWith(
        'amqp://guest:guest@localhost:5672',
      );
      expect(mockChannel.assertExchange).toHaveBeenCalledWith(
        EXCHANGE_NAME,
        'direct',
        { durable: true },
      );
    });

    it('should assert the DLQ as a durable queue', async () => {
      await service.onModuleInit();

      expect(mockChannel.assertQueue).toHaveBeenCalledWith(DLQ_NAME, {
        durable: true,
      });
    });

    it('should assert the main queue with dead-letter routing to DLQ', async () => {
      await service.onModuleInit();

      expect(mockChannel.assertQueue).toHaveBeenCalledWith(QUEUE_NAME, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': '',
          'x-dead-letter-routing-key': DLQ_NAME,
        },
      });
    });

    it('should bind the main queue to the exchange with the correct routing key', async () => {
      await service.onModuleInit();

      expect(mockChannel.bindQueue).toHaveBeenCalledWith(
        QUEUE_NAME,
        EXCHANGE_NAME,
        QUEUE_NAME,
      );
    });

    it('should log a warning and not throw if connection fails', async () => {
      (amqplib.connect as jest.Mock).mockRejectedValue(
        new Error('Connection refused'),
      );

      await expect(service.onModuleInit()).resolves.not.toThrow();
    });
  });

  describe('onModuleDestroy', () => {
    it('should close channel and connection on destroy', async () => {
      await service.onModuleInit();
      await service.onModuleDestroy();

      expect(mockChannel.close).toHaveBeenCalled();
      expect(mockConnection.close).toHaveBeenCalled();
    });

    it('should not throw if connection was never established', async () => {
      await expect(service.onModuleDestroy()).resolves.not.toThrow();
    });
  });

  describe('publish', () => {
    it('should publish a JSON-encoded message to the exchange', async () => {
      await service.onModuleInit();
      const payload = { applicationId: 'abc-123' };

      service.publish(QUEUE_NAME, payload);

      expect(mockChannel.publish).toHaveBeenCalledWith(
        EXCHANGE_NAME,
        QUEUE_NAME,
        Buffer.from(JSON.stringify(payload)),
        { persistent: true, contentType: 'application/json' },
      );
    });

    it('should log a warning and not throw if channel is not available', () => {
      expect(() =>
        service.publish(QUEUE_NAME, { applicationId: 'x' }),
      ).not.toThrow();
    });
  });
});
