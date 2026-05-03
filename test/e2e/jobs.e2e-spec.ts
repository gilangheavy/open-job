import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { ThrottlerStorage } from '@nestjs/throttler';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { CacheService } from '../../src/modules/cache/cache.service';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';

const getRandomString = () => Math.random().toString(36).substring(7);

const makeUser = () => ({
  fullname: `Job Owner ${getRandomString()}`,
  email: `jobowner_${getRandomString()}@example.com`,
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

async function loginUser(
  app: INestApplication<App>,
  email: string,
  password: string,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/authentications')
    .send({ email, password })
    .expect(201);
  return res.body.data.accessToken as string;
}

/**
 * Creates a user, a company, and a category, then logs in.
 * Returns the access token, company UUID, and category UUID.
 */
async function setupOwnerWithCompanyAndCategory(
  app: INestApplication<App>,
): Promise<{ token: string; companyId: string; categoryId: string }> {
  const user = makeUser();
  await request(app.getHttpServer())
    .post('/api/v1/users')
    .send(user)
    .expect(201);
  const token = await loginUser(app, user.email, user.password);

  const companyRes = await request(app.getHttpServer())
    .post('/api/v1/companies')
    .set('Authorization', `Bearer ${token}`)
    .send(makeCompanyPayload())
    .expect(201);

  const categoryRes = await request(app.getHttpServer())
    .post('/api/v1/categories')
    .set('Authorization', `Bearer ${token}`)
    .send(makeCategoryPayload())
    .expect(201);

  return {
    token,
    companyId: companyRes.body.data.id as string,
    categoryId: categoryRes.body.data.id as string,
  };
}

describe('JobsController (e2e)', () => {
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
    await prisma.client.job.deleteMany({});
    await prisma.client.category.deleteMany({});
    await prisma.client.company.deleteMany({});
    await prisma.client.authentication.deleteMany({});
    await prisma.client.user.deleteMany({});
    await app.close();
  });

  afterEach(async () => {
    await prisma.client.job.deleteMany({});
    await prisma.client.category.deleteMany({});
    await prisma.client.company.deleteMany({});
    await prisma.client.authentication.deleteMany({});
    await prisma.client.user.deleteMany({});
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/jobs
  // -----------------------------------------------------------------------
  describe('GET /api/v1/jobs', () => {
    it('should return paginated list of jobs (public)', async () => {
      const { token, companyId, categoryId } =
        await setupOwnerWithCompanyAndCategory(app);

      await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('Authorization', `Bearer ${token}`)
        .send(makeJobPayload(companyId, categoryId))
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/v1/jobs')
        .expect(200);

      expect(res.body.status).toBe('success');
      expect(res.body.data.items).toBeInstanceOf(Array);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.meta).toHaveProperty('total');
      expect(res.body.data.meta).toHaveProperty('page');
      expect(res.body.data.meta).toHaveProperty('limit');
      expect(res.body.data.meta).toHaveProperty('totalPages');
    });

    it('should return jobs matching ?title search (case-insensitive)', async () => {
      const { token, companyId, categoryId } =
        await setupOwnerWithCompanyAndCategory(app);

      const uniqueTitle = `BackendEngineer_${getRandomString()}`;
      await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('Authorization', `Bearer ${token}`)
        .send({
          ...makeJobPayload(companyId, categoryId),
          title: uniqueTitle,
        })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/jobs?title=${uniqueTitle.toLowerCase()}`)
        .expect(200);

      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
      const titles: string[] = res.body.data.items.map((j: { title: string }) =>
        j.title.toLowerCase(),
      );
      titles.forEach((t) => expect(t).toContain(uniqueTitle.toLowerCase()));
    });

    it('should return jobs matching ?company-name search (case-insensitive)', async () => {
      const user = makeUser();
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .send(user)
        .expect(201);
      const token = await loginUser(app, user.email, user.password);

      const uniqueCompanyName = `AcmeCorp_${getRandomString()}`;
      const companyRes = await request(app.getHttpServer())
        .post('/api/v1/companies')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: uniqueCompanyName, location: 'Jakarta' })
        .expect(201);

      const categoryRes = await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${token}`)
        .send(makeCategoryPayload())
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('Authorization', `Bearer ${token}`)
        .send(
          makeJobPayload(
            companyRes.body.data.id as string,
            categoryRes.body.data.id as string,
          ),
        )
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/jobs?company-name=${uniqueCompanyName.toLowerCase()}`)
        .expect(200);

      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
      const companyNames: string[] = res.body.data.items.map(
        (j: { company: { name: string } }) => j.company.name.toLowerCase(),
      );
      companyNames.forEach((n) =>
        expect(n).toContain(uniqueCompanyName.toLowerCase()),
      );
    });

    it('should not include soft-deleted jobs in the list', async () => {
      const { token, companyId, categoryId } =
        await setupOwnerWithCompanyAndCategory(app);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('Authorization', `Bearer ${token}`)
        .send(makeJobPayload(companyId, categoryId))
        .expect(201);

      const uuid: string = createRes.body.data.id;

      await request(app.getHttpServer())
        .delete(`/api/v1/jobs/${uuid}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const listRes = await request(app.getHttpServer())
        .get('/api/v1/jobs')
        .expect(200);

      const ids: string[] = listRes.body.data.items.map(
        (j: { id: string }) => j.id,
      );
      expect(ids).not.toContain(uuid);
    });

    it('should support pagination via ?page and ?limit', async () => {
      const { token, companyId, categoryId } =
        await setupOwnerWithCompanyAndCategory(app);

      for (let i = 0; i < 3; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/jobs')
          .set('Authorization', `Bearer ${token}`)
          .send(makeJobPayload(companyId, categoryId))
          .expect(201);
      }

      const res = await request(app.getHttpServer())
        .get('/api/v1/jobs?page=1&limit=2')
        .expect(200);

      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.meta.limit).toBe(2);
      expect(res.body.data.meta.page).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/v1/jobs
  // -----------------------------------------------------------------------
  describe('POST /api/v1/jobs', () => {
    it('should create a job for a company the user owns', async () => {
      const { token, companyId, categoryId } =
        await setupOwnerWithCompanyAndCategory(app);
      const payload = makeJobPayload(companyId, categoryId);

      const res = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('Authorization', `Bearer ${token}`)
        .send(payload)
        .expect(201);

      expect(res.body.status).toBe('success');
      expect(res.body.data.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(res.body.data.title).toBe(payload.title);
      expect(res.body.data.type).toBe(payload.type);
      expect(res.body.data.company.id).toBe(companyId);
      expect(res.body.data.category.id).toBe(categoryId);
      expect(res.body.data).not.toHaveProperty('deletedAt');
    });

    it('should return 403 when user does not own the company', async () => {
      const { companyId, categoryId } =
        await setupOwnerWithCompanyAndCategory(app);

      // A different user tries to post a job for the company above
      const other = makeUser();
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .send(other)
        .expect(201);
      const otherToken = await loginUser(app, other.email, other.password);

      const res = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('Authorization', `Bearer ${otherToken}`)
        .send(makeJobPayload(companyId, categoryId))
        .expect(403);

      expect(res.body.status).toBe('fail');
    });

    it('should return 401 when no token is provided', async () => {
      const { companyId, categoryId } =
        await setupOwnerWithCompanyAndCategory(app);

      const res = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .send(makeJobPayload(companyId, categoryId))
        .expect(401);

      expect(res.body.status).toBe('fail');
    });

    it('should return 400 when required fields are missing', async () => {
      const { token } = await setupOwnerWithCompanyAndCategory(app);

      const res = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'No company or category' })
        .expect(400);

      expect(res.body.status).toBe('fail');
    });

    it('should return 404 when company UUID does not exist', async () => {
      const { token, categoryId } = await setupOwnerWithCompanyAndCategory(app);

      const res = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('Authorization', `Bearer ${token}`)
        .send(
          makeJobPayload('00000000-0000-0000-0000-000000000000', categoryId),
        )
        .expect(404);

      expect(res.body.status).toBe('fail');
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/jobs/:uuid
  // -----------------------------------------------------------------------
  describe('GET /api/v1/jobs/:uuid', () => {
    it('should return job details with nested company and category', async () => {
      const { token, companyId, categoryId } =
        await setupOwnerWithCompanyAndCategory(app);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('Authorization', `Bearer ${token}`)
        .send(makeJobPayload(companyId, categoryId))
        .expect(201);

      const uuid: string = createRes.body.data.id;
      await cache.del(`jobs:${uuid}`);

      // First hit -> database
      const first = await request(app.getHttpServer())
        .get(`/api/v1/jobs/${uuid}`)
        .expect(200);

      expect(first.headers['x-data-source']).toBe('database');
      expect(first.body.data.id).toBe(uuid);
      expect(first.body.data).toHaveProperty('company');
      expect(first.body.data.company.id).toBe(companyId);
      expect(first.body.data).toHaveProperty('category');
      expect(first.body.data.category.id).toBe(categoryId);
      expect(first.body.data).not.toHaveProperty('deletedAt');

      // Second hit -> cache
      const second = await request(app.getHttpServer())
        .get(`/api/v1/jobs/${uuid}`)
        .expect(200);

      expect(second.headers['x-data-source']).toBe('cache');
      expect(second.body.data.id).toBe(uuid);
    });

    it('should return 400 for invalid UUID format', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/jobs/not-a-uuid')
        .expect(400);
    });

    it('should return 404 for soft-deleted job', async () => {
      const { token, companyId, categoryId } =
        await setupOwnerWithCompanyAndCategory(app);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('Authorization', `Bearer ${token}`)
        .send(makeJobPayload(companyId, categoryId))
        .expect(201);

      const uuid: string = createRes.body.data.id;

      await request(app.getHttpServer())
        .delete(`/api/v1/jobs/${uuid}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Cache invalidated after delete, so this hits DB
      await request(app.getHttpServer())
        .get(`/api/v1/jobs/${uuid}`)
        .expect(404);
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/jobs/company/:companyId
  // -----------------------------------------------------------------------
  describe('GET /api/v1/jobs/company/:companyId', () => {
    it('should return paginated jobs for a given company', async () => {
      const { token, companyId, categoryId } =
        await setupOwnerWithCompanyAndCategory(app);

      await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('Authorization', `Bearer ${token}`)
        .send(makeJobPayload(companyId, categoryId))
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/jobs/company/${companyId}`)
        .expect(200);

      expect(res.body.status).toBe('success');
      expect(res.body.data.items).toBeInstanceOf(Array);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
      const ids: string[] = res.body.data.items.map(
        (j: { company: { id: string } }) => j.company.id,
      );
      ids.forEach((id) => expect(id).toBe(companyId));
      expect(res.body.data.meta).toHaveProperty('total');
    });

    it('should return 404 for non-existent company UUID', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/jobs/company/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });

    it('should return 400 for invalid company UUID format', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/jobs/company/not-a-uuid')
        .expect(400);
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/jobs/category/:categoryId
  // -----------------------------------------------------------------------
  describe('GET /api/v1/jobs/category/:categoryId', () => {
    it('should return paginated jobs for a given category', async () => {
      const { token, companyId, categoryId } =
        await setupOwnerWithCompanyAndCategory(app);

      await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('Authorization', `Bearer ${token}`)
        .send(makeJobPayload(companyId, categoryId))
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/jobs/category/${categoryId}`)
        .expect(200);

      expect(res.body.status).toBe('success');
      expect(res.body.data.items).toBeInstanceOf(Array);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
      const ids: string[] = res.body.data.items.map(
        (j: { category: { id: string } }) => j.category.id,
      );
      ids.forEach((id) => expect(id).toBe(categoryId));
      expect(res.body.data.meta).toHaveProperty('total');
    });

    it('should return 404 for non-existent category UUID', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/jobs/category/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });

    it('should return 400 for invalid category UUID format', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/jobs/category/not-a-uuid')
        .expect(400);
    });
  });

  // -----------------------------------------------------------------------
  // PUT /api/v1/jobs/:uuid
  // -----------------------------------------------------------------------
  describe('PUT /api/v1/jobs/:uuid', () => {
    it('should update job when requested by the company owner', async () => {
      const { token, companyId, categoryId } =
        await setupOwnerWithCompanyAndCategory(app);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('Authorization', `Bearer ${token}`)
        .send(makeJobPayload(companyId, categoryId))
        .expect(201);

      const uuid: string = createRes.body.data.id;

      const res = await request(app.getHttpServer())
        .put(`/api/v1/jobs/${uuid}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Senior Backend Engineer' })
        .expect(200);

      expect(res.body.status).toBe('success');
      expect(res.body.message).toBe('Job updated successfully');
    });

    it('should return 403 when a non-owner tries to update', async () => {
      const { categoryId } = await setupOwnerWithCompanyAndCategory(app);

      // Create job as owner
      const ownerData = makeUser();
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .send(ownerData)
        .expect(201);
      const ownerToken = await loginUser(
        app,
        ownerData.email,
        ownerData.password,
      );

      // Get a fresh company owned by ownerData
      const ownerCompanyRes = await request(app.getHttpServer())
        .post('/api/v1/companies')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(makeCompanyPayload())
        .expect(201);

      const ownerCompanyId: string = ownerCompanyRes.body.data.id;

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(makeJobPayload(ownerCompanyId, categoryId))
        .expect(201);

      const uuid: string = createRes.body.data.id;

      // A different user (who owns a different company) tries to update
      const other = makeUser();
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .send(other)
        .expect(201);
      const otherToken = await loginUser(app, other.email, other.password);

      const res = await request(app.getHttpServer())
        .put(`/api/v1/jobs/${uuid}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ title: 'Hijacked Title' })
        .expect(403);

      expect(res.body.status).toBe('fail');
    });

    it('should return 401 when no token is provided', async () => {
      const { token, companyId, categoryId } =
        await setupOwnerWithCompanyAndCategory(app);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('Authorization', `Bearer ${token}`)
        .send(makeJobPayload(companyId, categoryId))
        .expect(201);

      const uuid: string = createRes.body.data.id;

      await request(app.getHttpServer())
        .put(`/api/v1/jobs/${uuid}`)
        .send({ title: 'No Token' })
        .expect(401);
    });

    it('should return 404 when job UUID does not exist', async () => {
      const { token } = await setupOwnerWithCompanyAndCategory(app);

      await request(app.getHttpServer())
        .put('/api/v1/jobs/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Ghost Job' })
        .expect(404);
    });

    it('should invalidate cache after update', async () => {
      const { token, companyId, categoryId } =
        await setupOwnerWithCompanyAndCategory(app);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('Authorization', `Bearer ${token}`)
        .send(makeJobPayload(companyId, categoryId))
        .expect(201);

      const uuid: string = createRes.body.data.id;

      // Warm up cache
      await request(app.getHttpServer())
        .get(`/api/v1/jobs/${uuid}`)
        .expect(200);

      // Update should invalidate cache
      await request(app.getHttpServer())
        .put(`/api/v1/jobs/${uuid}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Updated Title' })
        .expect(200);

      // Next GET should hit database
      const res = await request(app.getHttpServer())
        .get(`/api/v1/jobs/${uuid}`)
        .expect(200);

      expect(res.headers['x-data-source']).toBe('database');
    });
  });

  // -----------------------------------------------------------------------
  // DELETE /api/v1/jobs/:uuid
  // -----------------------------------------------------------------------
  describe('DELETE /api/v1/jobs/:uuid', () => {
    it('should soft delete job when requested by the company owner', async () => {
      const { token, companyId, categoryId } =
        await setupOwnerWithCompanyAndCategory(app);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('Authorization', `Bearer ${token}`)
        .send(makeJobPayload(companyId, categoryId))
        .expect(201);

      const uuid: string = createRes.body.data.id;

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/jobs/${uuid}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.status).toBe('success');
      expect(res.body.message).toBe('Job deleted successfully');

      // Subsequent GET should 404
      await request(app.getHttpServer())
        .get(`/api/v1/jobs/${uuid}`)
        .expect(404);
    });

    it('should return 403 when a non-owner tries to delete', async () => {
      const { token, companyId, categoryId } =
        await setupOwnerWithCompanyAndCategory(app);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('Authorization', `Bearer ${token}`)
        .send(makeJobPayload(companyId, categoryId))
        .expect(201);

      const uuid: string = createRes.body.data.id;

      const other = makeUser();
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .send(other)
        .expect(201);
      const otherToken = await loginUser(app, other.email, other.password);

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/jobs/${uuid}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);

      expect(res.body.status).toBe('fail');
    });

    it('should return 401 when no token is provided', async () => {
      const { token, companyId, categoryId } =
        await setupOwnerWithCompanyAndCategory(app);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('Authorization', `Bearer ${token}`)
        .send(makeJobPayload(companyId, categoryId))
        .expect(201);

      const uuid: string = createRes.body.data.id;

      await request(app.getHttpServer())
        .delete(`/api/v1/jobs/${uuid}`)
        .expect(401);
    });

    it('should return 404 when job UUID does not exist', async () => {
      const { token } = await setupOwnerWithCompanyAndCategory(app);

      await request(app.getHttpServer())
        .delete('/api/v1/jobs/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });
});
