import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import { App } from 'supertest/types';
import { ThrottlerStorage } from '@nestjs/throttler';
import type * as amqplib from 'amqplib';
import { AppModule } from '../../src/app.module';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { CacheService } from '../../src/modules/cache/cache.service';
import { QueueService } from '../../src/modules/queue/queue.service';
import { NotificationService } from '../../src/modules/queue/notification.service';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { validate } from '../../src/config/env.config';

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

const rand = () => Math.random().toString(36).substring(7);
const makeUser = () => ({
  fullname: `User ${rand()}`,
  email: `user_${rand()}@example.com`,
  password: 'StrongPassword123!',
});

async function registerAndLogin(
  app: INestApplication<App>,
): Promise<{ token: string; email: string; password: string }> {
  const user = makeUser();
  await request(app.getHttpServer()).post('/api/v1/users').send(user).expect(201);

  const res = await request(app.getHttpServer())
    .post('/api/v1/authentications')
    .send({ email: user.email, password: user.password })
    .expect(201);

  return {
    token: res.body.data.accessToken as string,
    email: user.email,
    password: user.password,
  };
}

async function setupOwnerWithJob(app: INestApplication<App>): Promise<{
  ownerToken: string;
  jobId: string;
}> {
  const { token: ownerToken } = await registerAndLogin(app);

  const companyRes = await request(app.getHttpServer())
    .post('/api/v1/companies')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ name: `Company ${rand()}`, description: 'Test', location: 'Jakarta' })
    .expect(201);

  const categoryRes = await request(app.getHttpServer())
    .post('/api/v1/categories')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ name: `Category ${rand()}` })
    .expect(201);

  const jobRes = await request(app.getHttpServer())
    .post('/api/v1/jobs')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({
      companyId: companyRes.body.data.id as string,
      categoryId: categoryRes.body.data.id as string,
      title: `Engineer ${rand()}`,
      description: 'Build things',
      location: 'Remote',
      salary: 10000000,
      type: 'Full-time',
    })
    .expect(201);

  return { ownerToken, jobId: jobRes.body.data.id as string };
}

const throttlerMock = {
  increment: jest.fn().mockResolvedValue({
    totalHits: 0,
    timeToExpire: 9999,
    isBlocked: false,
    timeToBlockExpire: 0,
  }),
};

// ─────────────────────────────────────────────────────────────────────────────
// PART 1: Producer — POST /applications fires the application:created event
// ─────────────────────────────────────────────────────────────────────────────

describe('Queue – Producer (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let cache: CacheService;
  let mockPublish: jest.Mock;

  beforeAll(async () => {
    mockPublish = jest.fn();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ThrottlerStorage)
      .useValue(throttlerMock)
      .overrideProvider(QueueService)
      .useValue({
        publish: mockPublish,
        onModuleInit: jest.fn(),
        onModuleDestroy: jest.fn(),
      })
      .overrideProvider(NotificationService)
      .useValue({ onModuleInit: jest.fn(), onModuleDestroy: jest.fn() })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());

    prisma = moduleFixture.get(PrismaService);
    cache = moduleFixture.get(CacheService);

    await app.init();
  });

  afterAll(async () => {
    await prisma.$executeRaw`DELETE FROM applications`;
    await prisma.client.job.deleteMany({});
    await prisma.client.category.deleteMany({});
    await prisma.client.company.deleteMany({});
    await prisma.client.authentication.deleteMany({});
    await prisma.client.user.deleteMany({});
    await app.close();
  });

  afterEach(async () => {
    await prisma.$executeRaw`DELETE FROM applications`;
    await prisma.client.job.deleteMany({});
    await prisma.client.category.deleteMany({});
    await prisma.client.company.deleteMany({});
    await prisma.client.authentication.deleteMany({});
    await prisma.client.user.deleteMany({});
    await cache.del('applications:*');
    mockPublish.mockClear();
  });

  it('should publish application.created event with the correct applicationId', async () => {
    const { jobId } = await setupOwnerWithJob(app);
    const { token } = await registerAndLogin(app);

    const res = await request(app.getHttpServer())
      .post('/api/v1/applications')
      .set('Authorization', `Bearer ${token}`)
      .send({ jobId })
      .expect(201);

    const applicationId = res.body.data.id as string;

    expect(mockPublish).toHaveBeenCalledTimes(1);
    expect(mockPublish).toHaveBeenCalledWith('application.created', {
      applicationId,
    });
  });

  it('should NOT publish event when application creation fails (duplicate)', async () => {
    const { jobId } = await setupOwnerWithJob(app);
    const { token } = await registerAndLogin(app);

    await request(app.getHttpServer())
      .post('/api/v1/applications')
      .set('Authorization', `Bearer ${token}`)
      .send({ jobId })
      .expect(201);

    mockPublish.mockClear();

    await request(app.getHttpServer())
      .post('/api/v1/applications')
      .set('Authorization', `Bearer ${token}`)
      .send({ jobId })
      .expect(409);

    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('should NOT publish event when owner applies to their own job (403)', async () => {
    const { ownerToken, jobId } = await setupOwnerWithJob(app);

    await request(app.getHttpServer())
      .post('/api/v1/applications')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ jobId })
      .expect(403);

    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('should return 201 immediately without waiting for RabbitMQ (fire-and-forget)', async () => {
    const { jobId } = await setupOwnerWithJob(app);
    const { token } = await registerAndLogin(app);

    const start = Date.now();
    await request(app.getHttpServer())
      .post('/api/v1/applications')
      .set('Authorization', `Bearer ${token}`)
      .send({ jobId })
      .expect(201);

    // Must complete well under 3s — not waiting on RabbitMQ
    expect(Date.now() - start).toBeLessThan(3000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PART 2: Consumer — NotificationService sends a real email via SMTP
// ─────────────────────────────────────────────────────────────────────────────

describe('Queue – Consumer / NotificationService (e2e)', () => {
  let nestModule: TestingModule;
  let notificationService: NotificationService;
  let prisma: PrismaService;

  let mockChannel: {
    ack: jest.Mock;
    nack: jest.Mock;
    publish: jest.Mock;
    close: jest.Mock;
  };

  // UUID of a real application seeded into the DB
  let applicationUuid: string;

  function buildMsg(
    payload: unknown,
    retryCount = 0,
  ): amqplib.Message {
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
        consumerTag: 'test-consumer',
      },
    } as unknown as amqplib.Message;
  }

  beforeAll(async () => {
    // Minimal module: ConfigService (reads .env) + Prisma + NotificationService
    // NotificationService.onModuleInit() will try RabbitMQ — fails gracefully,
    // then we inject a mock channel for the processMessage tests.
    nestModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, validate }),
        PrismaModule,
      ],
      providers: [NotificationService],
    }).compile();

    notificationService = nestModule.get(NotificationService);
    prisma = nestModule.get(PrismaService);

    await nestModule.init();

    // Override channel with mock (RabbitMQ may or may not be running)
    mockChannel = {
      ack: jest.fn(),
      nack: jest.fn(),
      publish: jest.fn().mockReturnValue(true),
      close: jest.fn().mockResolvedValue(undefined),
    };
    notificationService['channel'] = mockChannel as unknown as amqplib.Channel;

    // ── Seed: owner → company + category → job → applicant → application ─────
    const ownerEmail = `e2e_owner_${rand()}@example.com`;
    const applicantEmail = `e2e_applicant_${rand()}@example.com`;

    const owner = await prisma.client.user.create({
      data: { fullname: 'E2E Job Owner', email: ownerEmail, password: 'hashed' },
    });

    const applicant = await prisma.client.user.create({
      data: { fullname: 'E2E Applicant Budi', email: applicantEmail, password: 'hashed' },
    });

    const company = await prisma.client.company.create({
      data: {
        name: `E2E Company ${rand()}`,
        description: 'Test company',
        location: 'Jakarta',
        userId: owner.id,
      },
    });

    const category = await prisma.client.category.create({
      data: { name: `E2E Category ${rand()}` },
    });

    const job = await prisma.client.job.create({
      data: {
        title: 'E2E Software Engineer',
        description: 'Build things',
        location: 'Remote',
        type: 'Full-time',
        companyId: company.id,
        categoryId: category.id,
      },
    });

    const application = await prisma.client.application.create({
      data: { userId: applicant.id, jobId: job.id },
    });

    applicationUuid = application.uuid;
  });

  afterAll(async () => {
    await prisma.$executeRaw`DELETE FROM applications`;
    await prisma.$executeRaw`DELETE FROM jobs`;
    await prisma.$executeRaw`DELETE FROM categories`;
    await prisma.$executeRaw`DELETE FROM companies`;
    await prisma.$executeRaw`DELETE FROM users`;
    await nestModule.close();
  });

  afterEach(() => {
    mockChannel.ack.mockClear();
    mockChannel.nack.mockClear();
    mockChannel.publish.mockClear();
    // Re-inject mock channel in case it was replaced
    notificationService['channel'] = mockChannel as unknown as amqplib.Channel;
  });

  // ── Happy path — real SMTP email ────────────────────────────────────────────

  it('should send email to job owner and ack the message', async () => {
    const msg = buildMsg({ applicationId: applicationUuid });

    await notificationService.processMessage(msg);

    expect(mockChannel.ack).toHaveBeenCalledWith(msg);
    expect(mockChannel.nack).not.toHaveBeenCalled();
  }, 15_000); // Allow time for real SMTP

  // ── Malformed messages ──────────────────────────────────────────────────────

  it('should nack malformed JSON immediately without retry', async () => {
    const msg = {
      content: Buffer.from('not-valid-json{{{'),
      properties: { headers: {} },
      fields: {
        deliveryTag: 2,
        exchange: '',
        routingKey: '',
        redelivered: false,
        consumerTag: '',
      },
    } as unknown as amqplib.Message;

    await notificationService.processMessage(msg);

    expect(mockChannel.nack).toHaveBeenCalledWith(msg, false, false);
    expect(mockChannel.ack).not.toHaveBeenCalled();
  });

  it('should nack message missing applicationId field without retry', async () => {
    const msg = buildMsg({ wrongField: 'abc' });

    await notificationService.processMessage(msg);

    expect(mockChannel.nack).toHaveBeenCalledWith(msg, false, false);
    expect(mockChannel.ack).not.toHaveBeenCalled();
  });

  // ── DLQ ────────────────────────────────────────────────────────────────────

  it('should nack to DLQ when retryCount is already at max (3)', async () => {
    // Use a UUID that does not exist in DB — triggers error path
    const msg = buildMsg({ applicationId: '00000000-0000-0000-0000-000000000000' }, 3);

    await notificationService.processMessage(msg);

    expect(mockChannel.nack).toHaveBeenCalledWith(msg, false, false);
    expect(mockChannel.ack).not.toHaveBeenCalled();
  });

  it('should ack and schedule retry when retryCount < 3 and processing fails', async () => {
    jest
      .spyOn(
        notificationService as unknown as { delay: (ms: number) => Promise<void> },
        'delay',
      )
      .mockResolvedValue(undefined);

    // Non-existent application UUID with retryCount=0 → ack + republish with count=1
    const msg = buildMsg({ applicationId: '00000000-0000-0000-0000-000000000001' }, 0);

    await notificationService.processMessage(msg);

    expect(mockChannel.ack).toHaveBeenCalledWith(msg);
    expect(mockChannel.publish).toHaveBeenCalledWith(
      'openjob.events',
      'application.created',
      expect.any(Buffer),
      expect.objectContaining({ headers: { 'x-retry-count': 1 } }),
    );
  });
});
