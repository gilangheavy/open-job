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
  fullname: `Category Admin ${getRandomString()}`,
  email: `admin_${getRandomString()}@example.com`,
  password: 'StrongPassword123!',
});

const makeCategoryPayload = () => ({ name: `Category ${getRandomString()}` });

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

describe('CategoriesController (e2e)', () => {
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
    await prisma.client.category.deleteMany({});
    await prisma.client.authentication.deleteMany({});
    await prisma.client.user.deleteMany({});
    await app.close();
  });

  afterEach(async () => {
    await prisma.client.category.deleteMany({});
    await prisma.client.authentication.deleteMany({});
    await prisma.client.user.deleteMany({});
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/categories
  // -----------------------------------------------------------------------
  describe('GET /api/v1/categories', () => {
    it('should return paginated list of categories (public)', async () => {
      const user = makeUser();
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .send(user)
        .expect(201);
      const token = await loginUser(app, user.email, user.password);

      await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${token}`)
        .send(makeCategoryPayload())
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/v1/categories')
        .expect(200);

      expect(res.body.status).toBe('success');
      expect(res.body.data.items).toBeInstanceOf(Array);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.meta).toHaveProperty('total');
      expect(res.body.data.meta).toHaveProperty('page');
      expect(res.body.data.meta).toHaveProperty('limit');
      expect(res.body.data.meta).toHaveProperty('totalPages');
    });

    it('should not include soft-deleted categories in the list', async () => {
      const user = makeUser();
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .send(user)
        .expect(201);
      const token = await loginUser(app, user.email, user.password);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${token}`)
        .send(makeCategoryPayload())
        .expect(201);

      const uuid: string = createRes.body.data.id;

      await request(app.getHttpServer())
        .delete(`/api/v1/categories/${uuid}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const listRes = await request(app.getHttpServer())
        .get('/api/v1/categories')
        .expect(200);

      const ids: string[] = listRes.body.data.items.map(
        (c: { id: string }) => c.id,
      );
      expect(ids).not.toContain(uuid);
    });

    it('should respect pagination params', async () => {
      const user = makeUser();
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .send(user)
        .expect(201);
      const token = await loginUser(app, user.email, user.password);

      for (let i = 0; i < 3; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/categories')
          .set('Authorization', `Bearer ${token}`)
          .send(makeCategoryPayload())
          .expect(201);
      }

      const res = await request(app.getHttpServer())
        .get('/api/v1/categories?page=1&limit=2')
        .expect(200);

      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.meta.limit).toBe(2);
      expect(res.body.data.meta.totalPages).toBeGreaterThanOrEqual(2);
    });

    it('should not expose integer id in list items', async () => {
      const user = makeUser();
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .send(user)
        .expect(201);
      const token = await loginUser(app, user.email, user.password);

      await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${token}`)
        .send(makeCategoryPayload())
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/v1/categories')
        .expect(200);

      const item = res.body.data.items[0];
      expect(item.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(item).not.toHaveProperty('deletedAt');
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/v1/categories
  // -----------------------------------------------------------------------
  describe('POST /api/v1/categories', () => {
    it('should create a category for authenticated user', async () => {
      const user = makeUser();
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .send(user)
        .expect(201);
      const token = await loginUser(app, user.email, user.password);
      const payload = makeCategoryPayload();

      const res = await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${token}`)
        .send(payload)
        .expect(201);

      expect(res.body.status).toBe('success');
      expect(res.body.data.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(res.body.data.name).toBe(payload.name);
      expect(res.body.data).not.toHaveProperty('deletedAt');
    });

    it('should return 401 when no token is provided', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/categories')
        .send(makeCategoryPayload())
        .expect(401);

      expect(res.body.status).toBe('fail');
    });

    it('should return 400 when name is missing', async () => {
      const user = makeUser();
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .send(user)
        .expect(201);
      const token = await loginUser(app, user.email, user.password);

      const res = await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(400);

      expect(res.body.status).toBe('fail');
    });

    it('should return 409 when name already exists', async () => {
      const user = makeUser();
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .send(user)
        .expect(201);
      const token = await loginUser(app, user.email, user.password);
      const payload = makeCategoryPayload();

      await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${token}`)
        .send(payload)
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${token}`)
        .send(payload)
        .expect(409);

      expect(res.body.status).toBe('fail');
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/categories/:uuid
  // -----------------------------------------------------------------------
  describe('GET /api/v1/categories/:uuid', () => {
    it('should return category details and cache the second hit', async () => {
      const user = makeUser();
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .send(user)
        .expect(201);
      const token = await loginUser(app, user.email, user.password);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${token}`)
        .send(makeCategoryPayload())
        .expect(201);

      const uuid: string = createRes.body.data.id;
      await cache.del(`categories:${uuid}`);

      // First hit -> database
      const first = await request(app.getHttpServer())
        .get(`/api/v1/categories/${uuid}`)
        .expect(200);

      expect(first.headers['x-data-source']).toBe('database');
      expect(first.body.data.id).toBe(uuid);
      expect(first.body.data).not.toHaveProperty('deletedAt');

      // Second hit -> cache
      const second = await request(app.getHttpServer())
        .get(`/api/v1/categories/${uuid}`)
        .expect(200);

      expect(second.headers['x-data-source']).toBe('cache');
      expect(second.body.data.id).toBe(uuid);
    });

    it('should return 404 for invalid UUID format', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/categories/not-a-uuid')
        .expect(404);
    });

    it('should return 404 for soft-deleted category', async () => {
      const user = makeUser();
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .send(user)
        .expect(201);
      const token = await loginUser(app, user.email, user.password);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${token}`)
        .send(makeCategoryPayload())
        .expect(201);

      const uuid: string = createRes.body.data.id;

      await request(app.getHttpServer())
        .delete(`/api/v1/categories/${uuid}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/v1/categories/${uuid}`)
        .expect(404);
    });
  });

  // -----------------------------------------------------------------------
  // PUT /api/v1/categories/:uuid
  // -----------------------------------------------------------------------
  describe('PUT /api/v1/categories/:uuid', () => {
    it('should update category when authenticated', async () => {
      const user = makeUser();
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .send(user)
        .expect(201);
      const token = await loginUser(app, user.email, user.password);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${token}`)
        .send(makeCategoryPayload())
        .expect(201);

      const uuid: string = createRes.body.data.id;

      const res = await request(app.getHttpServer())
        .put(`/api/v1/categories/${uuid}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `Updated ${getRandomString()}` })
        .expect(200);

      expect(res.body.status).toBe('success');
      expect(res.body.message).toBe('Category updated successfully');
    });

    it('should return 401 when no token is provided', async () => {
      const user = makeUser();
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .send(user)
        .expect(201);
      const token = await loginUser(app, user.email, user.password);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${token}`)
        .send(makeCategoryPayload())
        .expect(201);

      const uuid: string = createRes.body.data.id;

      await request(app.getHttpServer())
        .put(`/api/v1/categories/${uuid}`)
        .send({ name: 'No Token' })
        .expect(401);
    });

    it('should return 404 when category does not exist', async () => {
      const user = makeUser();
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .send(user)
        .expect(201);
      const token = await loginUser(app, user.email, user.password);

      await request(app.getHttpServer())
        .put('/api/v1/categories/00000000-0000-4000-a000-000000000000')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Ghost' })
        .expect(404);
    });

    it('should return 409 when updated name conflicts with another category', async () => {
      const user = makeUser();
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .send(user)
        .expect(201);
      const token = await loginUser(app, user.email, user.password);

      const firstPayload = makeCategoryPayload();
      const secondPayload = makeCategoryPayload();

      await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${token}`)
        .send(firstPayload)
        .expect(201);

      const secondRes = await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${token}`)
        .send(secondPayload)
        .expect(201);

      const uuid: string = secondRes.body.data.id;

      const res = await request(app.getHttpServer())
        .put(`/api/v1/categories/${uuid}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: firstPayload.name })
        .expect(409);

      expect(res.body.status).toBe('fail');
    });

    it('should invalidate cache after update', async () => {
      const user = makeUser();
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .send(user)
        .expect(201);
      const token = await loginUser(app, user.email, user.password);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${token}`)
        .send(makeCategoryPayload())
        .expect(201);

      const uuid: string = createRes.body.data.id;

      // Warm up cache
      await request(app.getHttpServer())
        .get(`/api/v1/categories/${uuid}`)
        .expect(200);

      await request(app.getHttpServer())
        .put(`/api/v1/categories/${uuid}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `Updated ${getRandomString()}` })
        .expect(200);

      // Next GET must hit database
      const res = await request(app.getHttpServer())
        .get(`/api/v1/categories/${uuid}`)
        .expect(200);

      expect(res.headers['x-data-source']).toBe('database');
    });
  });

  // -----------------------------------------------------------------------
  // DELETE /api/v1/categories/:uuid
  // -----------------------------------------------------------------------
  describe('DELETE /api/v1/categories/:uuid', () => {
    it('should soft-delete category when authenticated', async () => {
      const user = makeUser();
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .send(user)
        .expect(201);
      const token = await loginUser(app, user.email, user.password);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${token}`)
        .send(makeCategoryPayload())
        .expect(201);

      const uuid: string = createRes.body.data.id;

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/categories/${uuid}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.status).toBe('success');
      expect(res.body.message).toBe('Category deleted successfully');

      // Subsequent GET should 404
      await request(app.getHttpServer())
        .get(`/api/v1/categories/${uuid}`)
        .expect(404);
    });

    it('should return 401 when no token is provided', async () => {
      const user = makeUser();
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .send(user)
        .expect(201);
      const token = await loginUser(app, user.email, user.password);

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${token}`)
        .send(makeCategoryPayload())
        .expect(201);

      const uuid: string = createRes.body.data.id;

      await request(app.getHttpServer())
        .delete(`/api/v1/categories/${uuid}`)
        .expect(401);
    });

    it('should return 404 when category does not exist', async () => {
      const user = makeUser();
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .send(user)
        .expect(201);
      const token = await loginUser(app, user.email, user.password);

      await request(app.getHttpServer())
        .delete('/api/v1/categories/00000000-0000-4000-a000-000000000000')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });
});
