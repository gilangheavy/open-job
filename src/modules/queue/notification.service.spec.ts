import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as amqplib from 'amqplib';
import * as nodemailer from 'nodemailer';
import { NotificationService } from './notification.service';
import { PrismaService } from '../../prisma/prisma.service';

jest.mock('amqplib');
jest.mock('nodemailer');

const APPLICANT_UUID = '111e8400-e29b-41d4-a716-446655440001';
const OWNER_UUID = '222e8400-e29b-41d4-a716-446655440002';
const JOB_UUID = '330e8400-e29b-41d4-a716-446655440003';
const APPLICATION_UUID = '550e8400-e29b-41d4-a716-446655440005';

const mockApplicant = {
  id: 1,
  uuid: APPLICANT_UUID,
  fullname: 'Budi Santoso',
  email: 'budi@example.com',
  password: 'hashed',
  createdAt: new Date('2026-01-15T00:00:00Z'),
  updatedAt: new Date('2026-01-15T00:00:00Z'),
  deletedAt: null,
};

const mockOwner = {
  id: 2,
  uuid: OWNER_UUID,
  fullname: 'Company Owner',
  email: 'owner@example.com',
  password: 'hashed',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  deletedAt: null,
};

const mockApplication = {
  id: 1,
  uuid: APPLICATION_UUID,
  userId: 1,
  jobId: 1,
  status: 'pending',
  createdAt: new Date('2026-01-15T00:00:00Z'),
  updatedAt: new Date('2026-01-15T00:00:00Z'),
  deletedAt: null,
  user: mockApplicant,
  job: {
    id: 1,
    uuid: JOB_UUID,
    title: 'Software Engineer',
    company: {
      id: 1,
      name: 'Test Company',
      owner: mockOwner,
    },
  },
};

describe('NotificationService', () => {
  let service: NotificationService;
  let mockChannel: jest.Mocked<amqplib.Channel>;
  let mockConnection: jest.Mocked<amqplib.ChannelModel>;
  let mockSendMail: jest.Mock;
  let prisma: {
    client: {
      application: {
        findUnique: jest.Mock;
      };
    };
  };

  beforeEach(async () => {
    mockChannel = {
      assertExchange: jest.fn().mockResolvedValue(undefined),
      assertQueue: jest.fn().mockResolvedValue(undefined),
      bindQueue: jest.fn().mockResolvedValue(undefined),
      consume: jest.fn().mockResolvedValue(undefined),
      ack: jest.fn(),
      nack: jest.fn(),
      publish: jest.fn().mockReturnValue(true),
      close: jest.fn().mockResolvedValue(undefined),
      prefetch: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
    } as unknown as jest.Mocked<amqplib.Channel>;

    mockConnection = {
      createChannel: jest.fn().mockResolvedValue(mockChannel),
      close: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<amqplib.ChannelModel>;

    (amqplib.connect as jest.Mock).mockResolvedValue(mockConnection);

    mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-id' });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({
      sendMail: mockSendMail,
    });

    prisma = {
      client: {
        application: {
          findUnique: jest.fn().mockResolvedValue(mockApplication),
        },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, string | number> = {
                RABBITMQ_HOST: 'localhost',
                RABBITMQ_PORT: 5672,
                RABBITMQ_USER: 'guest',
                RABBITMQ_PASSWORD: 'guest',
                MAIL_HOST: 'localhost',
                MAIL_PORT: 1025,
                MAIL_USER: 'test@example.com',
                MAIL_PASSWORD: 'password',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('onModuleInit', () => {
    it('should connect to RabbitMQ and start consuming', async () => {
      await service.onModuleInit();

      expect(amqplib.connect).toHaveBeenCalled();
      expect(mockChannel.prefetch).toHaveBeenCalledWith(1);
      expect(mockChannel.consume).toHaveBeenCalledWith(
        'application.created',
        expect.any(Function),
      );
    });

    it('should not throw if RabbitMQ connection fails', async () => {
      (amqplib.connect as jest.Mock).mockRejectedValue(
        new Error('Connection refused'),
      );

      await expect(service.onModuleInit()).resolves.not.toThrow();
    });
  });

  describe('onModuleDestroy', () => {
    it('should close channel and connection', async () => {
      await service.onModuleInit();
      await service.onModuleDestroy();

      expect(mockChannel.close).toHaveBeenCalled();
      expect(mockConnection.close).toHaveBeenCalled();
    });
  });

  describe('processMessage', () => {
    function makeMessage(payload: unknown, retryCount = 0): amqplib.Message {
      return {
        content: Buffer.from(JSON.stringify(payload)),
        properties: {
          headers: { 'x-retry-count': retryCount },
          contentType: 'application/json',
          deliveryMode: 2,
          persistent: true,
        },
        fields: {
          deliveryTag: 1,
          exchange: 'openjob.events',
          routingKey: 'application.created',
          redelivered: false,
          consumerTag: 'consumer-1',
        },
      } as unknown as amqplib.Message;
    }

    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should ack message and send email on successful processing', async () => {
      const msg = makeMessage({ applicationId: APPLICATION_UUID });

      await service.processMessage(msg);

      expect(prisma.client.application.findUnique).toHaveBeenCalledWith({
        where: { uuid: APPLICATION_UUID },
        include: {
          user: true,
          job: { include: { company: { include: { owner: true } } } },
        },
      });
      expect(mockSendMail).toHaveBeenCalled();
      expect(mockChannel.ack).toHaveBeenCalledWith(msg);
      expect(mockChannel.nack).not.toHaveBeenCalled();
    });

    it('should send email to the job owner, not the applicant', async () => {
      const msg = makeMessage({ applicationId: APPLICATION_UUID });

      await service.processMessage(msg);

      const mailOptions = mockSendMail.mock.calls[0][0] as { to: string };
      expect(mailOptions.to).toBe(mockOwner.email);
    });

    it('should include applicant name, email, and application date in the email', async () => {
      const msg = makeMessage({ applicationId: APPLICATION_UUID });

      await service.processMessage(msg);

      const mailOptions = mockSendMail.mock.calls[0][0] as {
        html: string;
        text: string;
      };
      const emailContent = mailOptions.html ?? mailOptions.text;
      expect(emailContent).toContain(mockApplicant.fullname);
      expect(emailContent).toContain(mockApplicant.email);
      expect(emailContent).toContain(
        mockApplication.createdAt.toISOString().split('T')[0],
      );
    });

    it('should nack malformed JSON without retry', async () => {
      const msg = {
        content: Buffer.from('not-valid-json'),
        properties: { headers: {} },
        fields: {
          deliveryTag: 1,
          exchange: '',
          routingKey: '',
          redelivered: false,
          consumerTag: '',
        },
      } as unknown as amqplib.Message;

      await service.processMessage(msg);

      expect(mockChannel.nack).toHaveBeenCalledWith(msg, false, false);
      expect(mockChannel.ack).not.toHaveBeenCalled();
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('should nack message without retry when applicationId is missing', async () => {
      const msg = makeMessage({ wrongField: 'value' });

      await service.processMessage(msg);

      expect(mockChannel.nack).toHaveBeenCalledWith(msg, false, false);
      expect(mockChannel.ack).not.toHaveBeenCalled();
    });

    it('should ack and republish with incremented retry count on transient failure (retryCount=0)', async () => {
      jest
        .spyOn(
          service as unknown as { delay: (ms: number) => Promise<void> },
          'delay',
        )
        .mockResolvedValue(undefined);
      prisma.client.application.findUnique.mockRejectedValueOnce(
        new Error('DB error'),
      );
      const msg = makeMessage({ applicationId: APPLICATION_UUID }, 0);

      await service.processMessage(msg);

      expect(mockChannel.ack).toHaveBeenCalledWith(msg);
      expect(mockChannel.publish).toHaveBeenCalledWith(
        'openjob.events',
        'application.created',
        expect.any(Buffer),
        expect.objectContaining({
          headers: { 'x-retry-count': 1 },
          persistent: true,
        }),
      );
    });

    it('should ack and republish with incremented retry count on transient failure (retryCount=1)', async () => {
      jest
        .spyOn(
          service as unknown as { delay: (ms: number) => Promise<void> },
          'delay',
        )
        .mockResolvedValue(undefined);
      prisma.client.application.findUnique.mockRejectedValueOnce(
        new Error('DB error'),
      );
      const msg = makeMessage({ applicationId: APPLICATION_UUID }, 1);

      await service.processMessage(msg);

      expect(mockChannel.ack).toHaveBeenCalledWith(msg);
      expect(mockChannel.publish).toHaveBeenCalledWith(
        'openjob.events',
        'application.created',
        expect.any(Buffer),
        expect.objectContaining({
          headers: { 'x-retry-count': 2 },
        }),
      );
    });

    it('should nack to DLQ after max retries (retryCount=3)', async () => {
      prisma.client.application.findUnique.mockRejectedValueOnce(
        new Error('Persistent failure'),
      );
      const msg = makeMessage({ applicationId: APPLICATION_UUID }, 3);

      await service.processMessage(msg);

      expect(mockChannel.nack).toHaveBeenCalledWith(msg, false, false);
      expect(mockChannel.ack).not.toHaveBeenCalled();
    });

    it('should nack to DLQ when application is not found in DB', async () => {
      prisma.client.application.findUnique.mockResolvedValueOnce(null);
      const msg = makeMessage({ applicationId: APPLICATION_UUID }, 3);

      await service.processMessage(msg);

      expect(mockChannel.nack).toHaveBeenCalledWith(msg, false, false);
    });
  });
});
