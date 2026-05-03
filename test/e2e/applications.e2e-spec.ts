import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { ThrottlerStorage } from '@nestjs/throttler';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { CacheService } from '../../src/modules/cache/cache.service';
import { QueueService } from '../../src/modules/queue/queue.service';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';

const getRandomString = () => Math.random().toString(36).substring(7);

const makeUser = () => ({
  fullname: `User ${getRandomString()}`,
  email: `user_${getRandomString()}@example.com`,
  password: 'StrongPassword123!',
});

const makeCompanyPayload = () => ({
  name: `Company ${getRandomString()}`,
  description: 'A great company',
  location: 'Jakarta',
});

const makeCategoryPayload = () => ({
  name: `Category ${getRandomString()}`,
});

const makeJobPayload = (companyId: string, categoryId: string) => ({
  companyId,
  categoryId,
  title: `Software Engineer ${getRandomString()}`,
  description: 'Build great things',
  location: 'Remote',
  salary: 10000000,
  type: 'Full-time',
});

async function registerAndLogin(
  app: INestApplication<App>,
): Promise<{ token: string; email: string }> {
  const user = makeUser();
  await request(app.getHttpServer())
    .post('/api/v1/users')
    .send(user)
    .expect(201);

  const res = await request(app.getHttpServer())
    .post('/api/v1/authentications')
    .send({ email: user.email, password: user.password })
    .expect(201);

  return { token: res.body.data.accessToken as string, email: user.email };
}

async function setupOwnerWithJob(app: INestApplication<App>): Promise<{
  ownerToken: string;
  jobId: string;
  companyId: string;
}> {
  const { token: ownerToken } = await registerAndLogin(app);

  const companyRes = await request(app.getHttpServer())
    .post('/api/v1/companies')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send(makeCompanyPayload())
    .expect(201);

  const categoryRes = await request(app.getHttpServer())
    .post('/api/v1/categories')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send(makeCategoryPayload())
    .expect(201);

  const jobRes = await request(app.getHttpServer())
    .post('/api/v1/jobs')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send(
      makeJobPayload(
        companyRes.body.data.id as string,
        categoryRes.body.data.id as string,
      ),
    )
    .expect(201);

  return {
    ownerToken,
    jobId: jobRes.body.data.id as string,
    companyId: companyRes.body.data.id as string,
  };
}

describe('ApplicationsController (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let cache: CacheService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ThrottlerStorage)
      .useValue({
        increment: jest.fn().mockResolvedValue({
          totalHits: 0,
          timeToExpire: 9999,
          isBlocked: false,
          timeToBlockExpire: 0,
        }),
      })
      // Mock QueueService to avoid real RabbitMQ connections in e2e tests
      .overrideProvider(QueueService)
      .useValue({
        publish: jest.fn(),
        onModuleInit: jest.fn(),
        onModuleDestroy: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
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
  });

  // -----------------------------------------------------------------------
  // POST /api/v1/applications
  // -----------------------------------------------------------------------
  describe('POST /api/v1/applications', () => {
    it('should create an application (201)', async () => {
      const { ownerToken, jobId } = await setupOwnerWithJob(app);
      const { token: applicantToken } = await registerAndLogin(app);

      const res = await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${applicantToken}`)
        .send({ jobId })
        .expect(201);

      expect(res.body.status).toBe('success');
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.jobId).toBe(jobId);
      expect(res.body.data.status).toBe('pending');
      void ownerToken;
    });

    it('should return 403 when owner applies to their own company job', async () => {
      const { ownerToken, jobId } = await setupOwnerWithJob(app);

      const res = await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ jobId })
        .expect(403);

      expect(res.body.status).toBe('fail');
    });

    it('should return 409 when user applies twice to the same job', async () => {
      const { jobId } = await setupOwnerWithJob(app);
      const { token: applicantToken } = await registerAndLogin(app);

      await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${applicantToken}`)
        .send({ jobId })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${applicantToken}`)
        .send({ jobId })
        .expect(409);

      expect(res.body.status).toBe('fail');
    });

    it('should return 401 when unauthenticated', async () => {
      const { jobId } = await setupOwnerWithJob(app);

      await request(app.getHttpServer())
        .post('/api/v1/applications')
        .send({ jobId })
        .expect(401);
    });

    it('should return 400 for missing jobId', async () => {
      const { token: applicantToken } = await registerAndLogin(app);

      await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${applicantToken}`)
        .send({})
        .expect(400);
    });

    it('should return 201 immediately (fire-and-forget RabbitMQ)', async () => {
      const { jobId } = await setupOwnerWithJob(app);
      const { token: applicantToken } = await registerAndLogin(app);

      // Must return 201 without blocking on RabbitMQ
      const start = Date.now();
      await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${applicantToken}`)
        .send({ jobId })
        .expect(201);
      const elapsed = Date.now() - start;

      // Should complete very quickly (< 5 seconds, well within acceptable range)
      expect(elapsed).toBeLessThan(5000);
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/applications
  // -----------------------------------------------------------------------
  describe('GET /api/v1/applications', () => {
    it('should return paginated list (authenticated)', async () => {
      const { jobId } = await setupOwnerWithJob(app);
      const { token: applicantToken } = await registerAndLogin(app);

      await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${applicantToken}`)
        .send({ jobId })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/v1/applications')
        .set('Authorization', `Bearer ${applicantToken}`)
        .expect(200);

      expect(res.body.status).toBe('success');
      expect(res.body.data.items).toBeInstanceOf(Array);
      expect(res.body.data.meta).toHaveProperty('total');
    });

    it('should return 401 when unauthenticated', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/applications')
        .expect(401);
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/applications/:uuid
  // -----------------------------------------------------------------------
  describe('GET /api/v1/applications/:uuid', () => {
    it('should return application detail for applicant (200)', async () => {
      const { jobId } = await setupOwnerWithJob(app);
      const { token: applicantToken } = await registerAndLogin(app);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${applicantToken}`)
        .send({ jobId })
        .expect(201);

      const applicationId: string = createRes.body.data.id as string;

      const res = await request(app.getHttpServer())
        .get(`/api/v1/applications/${applicationId}`)
        .set('Authorization', `Bearer ${applicantToken}`)
        .expect(200);

      expect(res.body.status).toBe('success');
      expect(res.body.data.id).toBe(applicationId);
    });

    it('should return application detail for company owner (200)', async () => {
      const { ownerToken, jobId } = await setupOwnerWithJob(app);
      const { token: applicantToken } = await registerAndLogin(app);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${applicantToken}`)
        .send({ jobId })
        .expect(201);

      const applicationId: string = createRes.body.data.id as string;

      const res = await request(app.getHttpServer())
        .get(`/api/v1/applications/${applicationId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body.data.id).toBe(applicationId);
    });

    it('should return X-Data-Source: cache on second request', async () => {
      const { jobId } = await setupOwnerWithJob(app);
      const { token: applicantToken } = await registerAndLogin(app);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${applicantToken}`)
        .send({ jobId })
        .expect(201);

      const applicationId: string = createRes.body.data.id as string;

      // First request — DB
      await request(app.getHttpServer())
        .get(`/api/v1/applications/${applicationId}`)
        .set('Authorization', `Bearer ${applicantToken}`)
        .expect(200);

      // Second request — should hit cache
      const res = await request(app.getHttpServer())
        .get(`/api/v1/applications/${applicationId}`)
        .set('Authorization', `Bearer ${applicantToken}`)
        .expect(200);

      expect(res.headers['x-data-source']).toBe('cache');
    });

    it('should return 403 for unauthorized third party', async () => {
      const { jobId } = await setupOwnerWithJob(app);
      const { token: applicantToken } = await registerAndLogin(app);
      const { token: thirdPartyToken } = await registerAndLogin(app);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${applicantToken}`)
        .send({ jobId })
        .expect(201);

      const applicationId: string = createRes.body.data.id as string;

      await request(app.getHttpServer())
        .get(`/api/v1/applications/${applicationId}`)
        .set('Authorization', `Bearer ${thirdPartyToken}`)
        .expect(403);
    });

    it('should return 404 for non-existent application', async () => {
      const { token } = await registerAndLogin(app);

      await request(app.getHttpServer())
        .get('/api/v1/applications/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('should return 401 when unauthenticated', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/applications/00000000-0000-0000-0000-000000000000')
        .expect(401);
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/applications/user/:userId
  // -----------------------------------------------------------------------
  describe('GET /api/v1/applications/user/:userId', () => {
    it('should return applications for current user (200)', async () => {
      const { jobId } = await setupOwnerWithJob(app);
      const { token: applicantToken } = await registerAndLogin(app);

      await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${applicantToken}`)
        .send({ jobId })
        .expect(201);

      // Get applicant's UUID from their profile
      const meRes = await request(app.getHttpServer())
        .get('/api/v1/profile')
        .set('Authorization', `Bearer ${applicantToken}`)
        .expect(200);

      const userId: string = meRes.body.data.id as string;

      const res = await request(app.getHttpServer())
        .get(`/api/v1/applications/user/${userId}`)
        .set('Authorization', `Bearer ${applicantToken}`)
        .expect(200);

      expect(res.body.status).toBe('success');
      expect(res.body.data.items).toBeInstanceOf(Array);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
    });

    it('should return 403 when accessing another user applications', async () => {
      const { token: token1 } = await registerAndLogin(app);
      const { token: token2 } = await registerAndLogin(app);

      const meRes = await request(app.getHttpServer())
        .get('/api/v1/profile')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      const userId: string = meRes.body.data.id as string;

      await request(app.getHttpServer())
        .get(`/api/v1/applications/user/${userId}`)
        .set('Authorization', `Bearer ${token2}`)
        .expect(403);
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/applications/job/:jobId
  // -----------------------------------------------------------------------
  describe('GET /api/v1/applications/job/:jobId', () => {
    it('should return applications for a job (company owner)', async () => {
      const { ownerToken, jobId } = await setupOwnerWithJob(app);
      const { token: applicantToken } = await registerAndLogin(app);

      await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${applicantToken}`)
        .send({ jobId })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/applications/job/${jobId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body.status).toBe('success');
      expect(res.body.data.items).toBeInstanceOf(Array);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
    });

    it('should return 403 for non-company-owner', async () => {
      const { jobId } = await setupOwnerWithJob(app);
      const { token: applicantToken } = await registerAndLogin(app);

      await request(app.getHttpServer())
        .get(`/api/v1/applications/job/${jobId}`)
        .set('Authorization', `Bearer ${applicantToken}`)
        .expect(403);
    });
  });

  // -----------------------------------------------------------------------
  // PUT /api/v1/applications/:uuid
  // -----------------------------------------------------------------------
  describe('PUT /api/v1/applications/:uuid', () => {
    it('should update status pending → accepted (200)', async () => {
      const { ownerToken, jobId } = await setupOwnerWithJob(app);
      const { token: applicantToken } = await registerAndLogin(app);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${applicantToken}`)
        .send({ jobId })
        .expect(201);

      const applicationId: string = createRes.body.data.id as string;

      const res = await request(app.getHttpServer())
        .put(`/api/v1/applications/${applicationId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'accepted' })
        .expect(200);

      expect(res.body.status).toBe('success');
    });

    it('should update status pending → rejected (200)', async () => {
      const { ownerToken, jobId } = await setupOwnerWithJob(app);
      const { token: applicantToken } = await registerAndLogin(app);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${applicantToken}`)
        .send({ jobId })
        .expect(201);

      const applicationId: string = createRes.body.data.id as string;

      const res = await request(app.getHttpServer())
        .put(`/api/v1/applications/${applicationId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'rejected' })
        .expect(200);

      expect(res.body.status).toBe('success');
    });

    it('should return 422 for invalid state transition (rejected → pending)', async () => {
      const { ownerToken, jobId } = await setupOwnerWithJob(app);
      const { token: applicantToken } = await registerAndLogin(app);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${applicantToken}`)
        .send({ jobId })
        .expect(201);

      const applicationId: string = createRes.body.data.id as string;

      // First reject
      await request(app.getHttpServer())
        .put(`/api/v1/applications/${applicationId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'rejected' })
        .expect(200);

      // Then try to set back to pending
      const res = await request(app.getHttpServer())
        .put(`/api/v1/applications/${applicationId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'pending' })
        .expect(422);

      expect(res.body.status).toBe('fail');
    });

    it('should return 403 when applicant tries to update status', async () => {
      const { jobId } = await setupOwnerWithJob(app);
      const { token: applicantToken } = await registerAndLogin(app);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${applicantToken}`)
        .send({ jobId })
        .expect(201);

      const applicationId: string = createRes.body.data.id as string;

      await request(app.getHttpServer())
        .put(`/api/v1/applications/${applicationId}`)
        .set('Authorization', `Bearer ${applicantToken}`)
        .send({ status: 'accepted' })
        .expect(403);
    });

    it('should return 400 for invalid status value', async () => {
      const { ownerToken, jobId } = await setupOwnerWithJob(app);
      const { token: applicantToken } = await registerAndLogin(app);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${applicantToken}`)
        .send({ jobId })
        .expect(201);

      const applicationId: string = createRes.body.data.id as string;

      await request(app.getHttpServer())
        .put(`/api/v1/applications/${applicationId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'invalid_status' })
        .expect(400);
    });
  });

  // -----------------------------------------------------------------------
  // DELETE /api/v1/applications/:uuid
  // -----------------------------------------------------------------------
  describe('DELETE /api/v1/applications/:uuid', () => {
    it('should hard delete application by applicant (200)', async () => {
      const { jobId } = await setupOwnerWithJob(app);
      const { token: applicantToken } = await registerAndLogin(app);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${applicantToken}`)
        .send({ jobId })
        .expect(201);

      const applicationId: string = createRes.body.data.id as string;

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/applications/${applicationId}`)
        .set('Authorization', `Bearer ${applicantToken}`)
        .expect(200);

      expect(res.body.status).toBe('success');

      // Verify it's truly deleted (hard delete — not findable even with DB query)
      const deleted = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count FROM applications WHERE uuid::text = ${applicationId}
      `;
      expect(Number(deleted[0].count)).toBe(0);
    });

    it('should return 403 when company owner tries to delete', async () => {
      const { ownerToken, jobId } = await setupOwnerWithJob(app);
      const { token: applicantToken } = await registerAndLogin(app);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${applicantToken}`)
        .send({ jobId })
        .expect(201);

      const applicationId: string = createRes.body.data.id as string;

      await request(app.getHttpServer())
        .delete(`/api/v1/applications/${applicationId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(403);
    });

    it('should return 404 for non-existent application', async () => {
      const { token } = await registerAndLogin(app);

      await request(app.getHttpServer())
        .delete('/api/v1/applications/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('should return 401 when unauthenticated', async () => {
      await request(app.getHttpServer())
        .delete('/api/v1/applications/00000000-0000-0000-0000-000000000000')
        .expect(401);
    });
  });
});
