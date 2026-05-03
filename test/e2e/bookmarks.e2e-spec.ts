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

async function setupUserWithJob(app: INestApplication<App>): Promise<{
  ownerToken: string;
  applicantToken: string;
  jobId: string;
}> {
  const { token: ownerToken } = await registerAndLogin(app);
  const { token: applicantToken } = await registerAndLogin(app);

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
    applicantToken,
    jobId: jobRes.body.data.id as string,
  };
}

describe('BookmarksController (e2e)', () => {
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
    await prisma.$executeRaw`DELETE FROM bookmarks`;
    await prisma.client.job.deleteMany({});
    await prisma.client.category.deleteMany({});
    await prisma.client.company.deleteMany({});
    await prisma.client.authentication.deleteMany({});
    await prisma.client.user.deleteMany({});
    await app.close();
  });

  afterEach(async () => {
    await prisma.$executeRaw`DELETE FROM bookmarks`;
    await prisma.client.job.deleteMany({});
    await prisma.client.category.deleteMany({});
    await prisma.client.company.deleteMany({});
    await prisma.client.authentication.deleteMany({});
    await prisma.client.user.deleteMany({});
    await cache.delPattern('bookmarks:*');
  });

  // -----------------------------------------------------------------------
  // POST /api/v1/jobs/:jobId/bookmark
  // -----------------------------------------------------------------------
  describe('POST /api/v1/jobs/:jobId/bookmark', () => {
    it('should create a bookmark and return 201 (AC: valid job)', async () => {
      const { applicantToken, jobId } = await setupUserWithJob(app);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/bookmark`)
        .set('Authorization', `Bearer ${applicantToken}`)
        .expect(201);

      expect(res.body.status).toBe('success');
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.jobId).toBe(jobId);
      expect(typeof res.body.data.id).toBe('string');
    });

    it('should return 401 when unauthenticated', async () => {
      const { jobId } = await setupUserWithJob(app);

      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/bookmark`)
        .expect(401);
    });

    it('should return 409 when bookmarking the same job twice (AC: duplicate bookmark)', async () => {
      const { applicantToken, jobId } = await setupUserWithJob(app);

      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/bookmark`)
        .set('Authorization', `Bearer ${applicantToken}`)
        .expect(201);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/bookmark`)
        .set('Authorization', `Bearer ${applicantToken}`)
        .expect(409);

      expect(res.body.status).toBe('fail');
    });

    it('should return 404 when job does not exist (AC: non-existent job)', async () => {
      const { applicantToken } = await setupUserWithJob(app);
      const nonExistentJobId = '00000000-0000-7000-8000-000000000000';

      const res = await request(app.getHttpServer())
        .post(`/api/v1/jobs/${nonExistentJobId}/bookmark`)
        .set('Authorization', `Bearer ${applicantToken}`)
        .expect(404);

      expect(res.body.status).toBe('fail');
    });

    it('should return 404 when job is soft-deleted (AC: soft-deleted job)', async () => {
      const { ownerToken, applicantToken, jobId } =
        await setupUserWithJob(app);

      // Soft-delete the job
      await request(app.getHttpServer())
        .delete(`/api/v1/jobs/${jobId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/bookmark`)
        .set('Authorization', `Bearer ${applicantToken}`)
        .expect(404);

      expect(res.body.status).toBe('fail');
    });

    it('should not expose integer id in response (AC: no integer id)', async () => {
      const { applicantToken, jobId } = await setupUserWithJob(app);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/bookmark`)
        .set('Authorization', `Bearer ${applicantToken}`)
        .expect(201);

      expect(res.body.data).not.toHaveProperty('deletedAt');
      // id must be a UUID string, not integer
      expect(typeof res.body.data.id).toBe('string');
      expect(res.body.data.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });
  });

  // -----------------------------------------------------------------------
  // DELETE /api/v1/jobs/:jobId/bookmark
  // -----------------------------------------------------------------------
  describe('DELETE /api/v1/jobs/:jobId/bookmark', () => {
    it('should delete bookmark and return success (200)', async () => {
      const { applicantToken, jobId } = await setupUserWithJob(app);

      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/bookmark`)
        .set('Authorization', `Bearer ${applicantToken}`)
        .expect(201);

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/jobs/${jobId}/bookmark`)
        .set('Authorization', `Bearer ${applicantToken}`)
        .expect(200);

      expect(res.body.status).toBe('success');
    });

    it('should return 404 when bookmark does not exist', async () => {
      const { applicantToken, jobId } = await setupUserWithJob(app);

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/jobs/${jobId}/bookmark`)
        .set('Authorization', `Bearer ${applicantToken}`)
        .expect(404);

      expect(res.body.status).toBe('fail');
    });

    it('should return 404 when another user tries to delete a bookmark they do not own (no information disclosure)', async () => {
      const { applicantToken, jobId } = await setupUserWithJob(app);
      const { token: anotherToken } = await registerAndLogin(app);

      // applicant creates bookmark
      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/bookmark`)
        .set('Authorization', `Bearer ${applicantToken}`)
        .expect(201);

      // another user tries to delete
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/jobs/${jobId}/bookmark`)
        .set('Authorization', `Bearer ${anotherToken}`)
        .expect(404);

      // another user gets 404 (no bookmark for them), no info disclosure
      expect(res.body.status).toBe('fail');
    });

    it('should return 401 when unauthenticated', async () => {
      const { jobId } = await setupUserWithJob(app);

      await request(app.getHttpServer())
        .delete(`/api/v1/jobs/${jobId}/bookmark`)
        .expect(401);
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/jobs/:jobId/bookmark/:id
  // -----------------------------------------------------------------------
  describe('GET /api/v1/jobs/:jobId/bookmark/:id', () => {
    it('should return bookmark details (200)', async () => {
      const { applicantToken, jobId } = await setupUserWithJob(app);

      const createRes = await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/bookmark`)
        .set('Authorization', `Bearer ${applicantToken}`)
        .expect(201);

      const bookmarkId = createRes.body.data.id as string;

      const res = await request(app.getHttpServer())
        .get(`/api/v1/jobs/${jobId}/bookmark/${bookmarkId}`)
        .set('Authorization', `Bearer ${applicantToken}`)
        .expect(200);

      expect(res.body.status).toBe('success');
      expect(res.body.data.id).toBe(bookmarkId);
      expect(res.body.data.jobId).toBe(jobId);
    });

    it('should return 404 when bookmarkId does not belong to the given jobId', async () => {
      const { applicantToken, jobId } = await setupUserWithJob(app);
      const { jobId: otherJobId } = await setupUserWithJob(app);

      const createRes = await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/bookmark`)
        .set('Authorization', `Bearer ${applicantToken}`)
        .expect(201);

      const bookmarkId = createRes.body.data.id as string;

      // access bookmark under a different jobId — must be 404, not 403
      const res = await request(app.getHttpServer())
        .get(`/api/v1/jobs/${otherJobId}/bookmark/${bookmarkId}`)
        .set('Authorization', `Bearer ${applicantToken}`)
        .expect(404);

      expect(res.body.status).toBe('fail');
    });

    it('should return 403 when another user tries to access the bookmark', async () => {
      const { applicantToken, jobId } = await setupUserWithJob(app);
      const { token: anotherToken } = await registerAndLogin(app);

      const createRes = await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/bookmark`)
        .set('Authorization', `Bearer ${applicantToken}`)
        .expect(201);

      const bookmarkId = createRes.body.data.id as string;

      const res = await request(app.getHttpServer())
        .get(`/api/v1/jobs/${jobId}/bookmark/${bookmarkId}`)
        .set('Authorization', `Bearer ${anotherToken}`)
        .expect(403);

      expect(res.body.status).toBe('fail');
    });

    it('should return 404 when bookmark does not exist', async () => {
      const { applicantToken, jobId } = await setupUserWithJob(app);
      const nonExistentId = '00000000-0000-7000-8000-000000000001';

      const res = await request(app.getHttpServer())
        .get(`/api/v1/jobs/${jobId}/bookmark/${nonExistentId}`)
        .set('Authorization', `Bearer ${applicantToken}`)
        .expect(404);

      expect(res.body.status).toBe('fail');
    });

    it('should return 401 when unauthenticated', async () => {
      const { jobId } = await setupUserWithJob(app);
      const nonExistentId = '00000000-0000-7000-8000-000000000001';

      await request(app.getHttpServer())
        .get(`/api/v1/jobs/${jobId}/bookmark/${nonExistentId}`)
        .expect(401);
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/bookmarks
  // -----------------------------------------------------------------------
  describe('GET /api/v1/bookmarks', () => {
    it('should return paginated bookmarks for the authenticated user (200)', async () => {
      const { applicantToken, jobId } = await setupUserWithJob(app);

      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/bookmark`)
        .set('Authorization', `Bearer ${applicantToken}`)
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/v1/bookmarks')
        .set('Authorization', `Bearer ${applicantToken}`)
        .expect(200);

      expect(res.body.status).toBe('success');
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.meta).toBeDefined();
      expect(res.body.data.items[0].jobId).toBe(jobId);
    });

    it('should return empty list when user has no bookmarks', async () => {
      const { token } = await registerAndLogin(app);

      const res = await request(app.getHttpServer())
        .get('/api/v1/bookmarks')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.status).toBe('success');
      expect(res.body.data.items).toHaveLength(0);
      expect(res.body.data.meta.total).toBe(0);
    });

    it('should set X-Data-Source: database on first request', async () => {
      const { token } = await registerAndLogin(app);

      const res = await request(app.getHttpServer())
        .get('/api/v1/bookmarks')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.headers['x-data-source']).toBe('database');
    });

    it('should set X-Data-Source: cache on second request (AC: cache hit returns header)', async () => {
      const { token } = await registerAndLogin(app);

      // First request: populates cache
      await request(app.getHttpServer())
        .get('/api/v1/bookmarks')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Second request: should hit cache
      const res = await request(app.getHttpServer())
        .get('/api/v1/bookmarks')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.headers['x-data-source']).toBe('cache');
    });

    it('should only return bookmarks belonging to the requesting user', async () => {
      const { applicantToken, jobId } = await setupUserWithJob(app);
      const { token: otherToken } = await registerAndLogin(app);

      // applicant creates bookmark
      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/bookmark`)
        .set('Authorization', `Bearer ${applicantToken}`)
        .expect(201);

      // other user's list should be empty
      const res = await request(app.getHttpServer())
        .get('/api/v1/bookmarks')
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(200);

      expect(res.body.data.items).toHaveLength(0);
    });

    it('should return 401 when unauthenticated', async () => {
      await request(app.getHttpServer()).get('/api/v1/bookmarks').expect(401);
    });

    it('should not expose integer id in response items (AC: no integer id)', async () => {
      const { applicantToken, jobId } = await setupUserWithJob(app);

      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/bookmark`)
        .set('Authorization', `Bearer ${applicantToken}`)
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/v1/bookmarks')
        .set('Authorization', `Bearer ${applicantToken}`)
        .expect(200);

      const item = res.body.data.items[0] as Record<string, unknown>;
      expect(typeof item.id).toBe('string');
      expect(item.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });
  });
});
