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
  fullname: `Company Owner ${getRandomString()}`,
  email: `owner_${getRandomString()}@example.com`,
  password: 'StrongPassword123!',
});

const makeCompanyPayload = () => ({
  name: `Company ${getRandomString()}`,
  description: 'A great place to work',
  location: 'Jakarta',
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
  // TransformInterceptor wraps response: { status, data: { accessToken, refreshToken } }
  return res.body.data.accessToken as string;
}

describe('CompaniesController (e2e)', () => {
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
    await prisma.client.company.deleteMany({});
    await prisma.client.authentication.deleteMany({});
    await prisma.client.user.deleteMany({});
    await app.close();
  });

  afterEach(async () => {
    await prisma.client.company.deleteMany({});
    await prisma.client.authentication.deleteMany({});
    await prisma.client.user.deleteMany({});
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/companies
  // -----------------------------------------------------------------------
  describe('GET /api/v1/companies', () => {
    it('should return paginated list of companies (public)', async () => {
      const user = makeUser();
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .send(user)
        .expect(201);
      const token = await loginUser(app, user.email, user.password);

      await request(app.getHttpServer())
        .post('/api/v1/companies')
        .set('Authorization', `Bearer ${token}`)
        .send(makeCompanyPayload())
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/v1/companies')
        .expect(200);

      expect(res.body.status).toBe('success');
      expect(res.body.data.items).toBeInstanceOf(Array);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.meta).toHaveProperty('total');
      expect(res.body.data.meta).toHaveProperty('page');
      expect(res.body.data.meta).toHaveProperty('limit');
      expect(res.body.data.meta).toHaveProperty('totalPages');
    });

    it('should not include soft-deleted companies in the list', async () => {
      const user = makeUser();
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .send(user)
        .expect(201);
      const token = await loginUser(app, user.email, user.password);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/companies')
        .set('Authorization', `Bearer ${token}`)
        .send(makeCompanyPayload())
        .expect(201);

      const uuid: string = createRes.body.data.id;

      await request(app.getHttpServer())
        .delete(`/api/v1/companies/${uuid}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const listRes = await request(app.getHttpServer())
        .get('/api/v1/companies')
        .expect(200);

      const ids: string[] = listRes.body.data.items.map(
        (c: { id: string }) => c.id,
      );
      expect(ids).not.toContain(uuid);
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/v1/companies
  // -----------------------------------------------------------------------
  describe('POST /api/v1/companies', () => {
    it('should create a company for authenticated user', async () => {
      const user = makeUser();
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .send(user)
        .expect(201);
      const token = await loginUser(app, user.email, user.password);
      const payload = makeCompanyPayload();

      const res = await request(app.getHttpServer())
        .post('/api/v1/companies')
        .set('Authorization', `Bearer ${token}`)
        .send(payload)
        .expect(201);

      expect(res.body.status).toBe('success');
      expect(res.body.data.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(res.body.data.name).toBe(payload.name);
      expect(res.body.data.location).toBe(payload.location);
      expect(res.body.data).not.toHaveProperty('deletedAt');
    });

    it('should return 401 when no token is provided', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/companies')
        .send(makeCompanyPayload())
        .expect(401);

      expect(res.body.status).toBe('fail');
    });

    it('should return 400 when required fields are missing', async () => {
      const user = makeUser();
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .send(user)
        .expect(201);
      const token = await loginUser(app, user.email, user.password);

      const res = await request(app.getHttpServer())
        .post('/api/v1/companies')
        .set('Authorization', `Bearer ${token}`)
        .send({ description: 'No name or location' })
        .expect(400);

      expect(res.body.status).toBe('fail');
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/companies/:uuid
  // -----------------------------------------------------------------------
  describe('GET /api/v1/companies/:uuid', () => {
    it('should return company details and cache the second hit', async () => {
      const user = makeUser();
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .send(user)
        .expect(201);
      const token = await loginUser(app, user.email, user.password);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/companies')
        .set('Authorization', `Bearer ${token}`)
        .send(makeCompanyPayload())
        .expect(201);

      const uuid: string = createRes.body.data.id;
      await cache.del(`companies:${uuid}`);

      // First hit -> database
      const first = await request(app.getHttpServer())
        .get(`/api/v1/companies/${uuid}`)
        .expect(200);

      expect(first.headers['x-data-source']).toBe('database');
      expect(first.body.data.id).toBe(uuid);
      expect(first.body.data).not.toHaveProperty('deletedAt');

      // Second hit -> cache
      const second = await request(app.getHttpServer())
        .get(`/api/v1/companies/${uuid}`)
        .expect(200);

      expect(second.headers['x-data-source']).toBe('cache');
      expect(second.body.data.id).toBe(uuid);
    });

    it('should return 404 for invalid UUID format', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/companies/not-a-uuid')
        .expect(404);
    });

    it('should return 404 for soft-deleted company', async () => {
      const user = makeUser();
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .send(user)
        .expect(201);
      const token = await loginUser(app, user.email, user.password);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/companies')
        .set('Authorization', `Bearer ${token}`)
        .send(makeCompanyPayload())
        .expect(201);

      const uuid: string = createRes.body.data.id;

      await request(app.getHttpServer())
        .delete(`/api/v1/companies/${uuid}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Cache is invalidated after delete, so this hits DB
      await request(app.getHttpServer())
        .get(`/api/v1/companies/${uuid}`)
        .expect(404);
    });
  });

  // -----------------------------------------------------------------------
  // PUT /api/v1/companies/:uuid
  // -----------------------------------------------------------------------
  describe('PUT /api/v1/companies/:uuid', () => {
    it('should update company when requested by the owner', async () => {
      const user = makeUser();
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .send(user)
        .expect(201);
      const token = await loginUser(app, user.email, user.password);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/companies')
        .set('Authorization', `Bearer ${token}`)
        .send(makeCompanyPayload())
        .expect(201);

      const uuid: string = createRes.body.data.id;

      const res = await request(app.getHttpServer())
        .put(`/api/v1/companies/${uuid}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated Company Name' })
        .expect(200);

      expect(res.body.status).toBe('success');
      expect(res.body.message).toBe('Company updated successfully');
    });

    it('should return 403 when a non-owner tries to update', async () => {
      const owner = makeUser();
      const other = makeUser();
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .send(owner)
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .send(other)
        .expect(201);
      const ownerToken = await loginUser(app, owner.email, owner.password);
      const otherToken = await loginUser(app, other.email, other.password);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/companies')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(makeCompanyPayload())
        .expect(201);

      const uuid: string = createRes.body.data.id;

      const res = await request(app.getHttpServer())
        .put(`/api/v1/companies/${uuid}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ name: 'Hijacked Name' })
        .expect(403);

      expect(res.body.status).toBe('fail');
    });

    it('should return 401 when no token is provided', async () => {
      const user = makeUser();
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .send(user)
        .expect(201);
      const token = await loginUser(app, user.email, user.password);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/companies')
        .set('Authorization', `Bearer ${token}`)
        .send(makeCompanyPayload())
        .expect(201);

      const uuid: string = createRes.body.data.id;

      await request(app.getHttpServer())
        .put(`/api/v1/companies/${uuid}`)
        .send({ name: 'No Token' })
        .expect(401);
    });

    it('should invalidate cache after update', async () => {
      const user = makeUser();
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .send(user)
        .expect(201);
      const token = await loginUser(app, user.email, user.password);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/companies')
        .set('Authorization', `Bearer ${token}`)
        .send(makeCompanyPayload())
        .expect(201);

      const uuid: string = createRes.body.data.id;

      // Warm up the cache
      await request(app.getHttpServer())
        .get(`/api/v1/companies/${uuid}`)
        .expect(200);

      // Update should invalidate cache
      await request(app.getHttpServer())
        .put(`/api/v1/companies/${uuid}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'New Name After Update' })
        .expect(200);

      // Next GET should hit database
      const res = await request(app.getHttpServer())
        .get(`/api/v1/companies/${uuid}`)
        .expect(200);

      expect(res.headers['x-data-source']).toBe('database');
    });
  });

  // -----------------------------------------------------------------------
  // DELETE /api/v1/companies/:uuid
  // -----------------------------------------------------------------------
  describe('DELETE /api/v1/companies/:uuid', () => {
    it('should soft delete company when requested by owner', async () => {
      const user = makeUser();
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .send(user)
        .expect(201);
      const token = await loginUser(app, user.email, user.password);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/companies')
        .set('Authorization', `Bearer ${token}`)
        .send(makeCompanyPayload())
        .expect(201);

      const uuid: string = createRes.body.data.id;

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/companies/${uuid}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.status).toBe('success');
      expect(res.body.message).toBe('Company deleted successfully');

      // Subsequent GET should 404
      await request(app.getHttpServer())
        .get(`/api/v1/companies/${uuid}`)
        .expect(404);
    });

    it('should return 403 when a non-owner tries to delete', async () => {
      const owner = makeUser();
      const other = makeUser();
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .send(owner)
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .send(other)
        .expect(201);
      const ownerToken = await loginUser(app, owner.email, owner.password);
      const otherToken = await loginUser(app, other.email, other.password);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/companies')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(makeCompanyPayload())
        .expect(201);

      const uuid: string = createRes.body.data.id;

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/companies/${uuid}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);

      expect(res.body.status).toBe('fail');
    });

    it('should return 401 when no token is provided', async () => {
      const user = makeUser();
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .send(user)
        .expect(201);
      const token = await loginUser(app, user.email, user.password);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/companies')
        .set('Authorization', `Bearer ${token}`)
        .send(makeCompanyPayload())
        .expect(201);

      const uuid: string = createRes.body.data.id;

      await request(app.getHttpServer())
        .delete(`/api/v1/companies/${uuid}`)
        .expect(401);
    });
  });
});
