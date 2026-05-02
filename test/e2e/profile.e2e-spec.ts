import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { ThrottlerStorage } from '@nestjs/throttler';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';

const TEST_USER = {
  fullname: 'Profile E2E User',
  email: `profile_e2e_${Date.now()}@example.com`,
  password: 'StrongPassword123!',
};

describe('ProfileController (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let accessToken: string;
  let userId: number;

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
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());

    await app.init();

    prisma = app.get(PrismaService);

    // Register test user
    await request(app.getHttpServer())
      .post('/api/v1/users')
      .send(TEST_USER)
      .expect(201);

    // Login to get access token
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/authentications')
      .send({ email: TEST_USER.email, password: TEST_USER.password })
      .expect(201);

    accessToken = (
      loginRes.body.data as { accessToken: string; refreshToken: string }
    ).accessToken;

    const userRecord = await prisma.client.user.findUnique({
      where: { email: TEST_USER.email },
    });
    userId = userRecord!.id;
  });

  afterAll(async () => {
    await prisma.client.bookmark.deleteMany({ where: { userId } });
    await prisma.client.application.deleteMany({ where: { userId } });
    await prisma.client.authentication.deleteMany({});
    await prisma.client.user.deleteMany({ where: { email: TEST_USER.email } });
    await app.close();
  });

  // -------------------------------------------------------------------------
  // Auth guard — unauthenticated requests
  // -------------------------------------------------------------------------
  describe('Auth guard', () => {
    it('GET /api/v1/profile — 401 when no token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/profile')
        .expect(401);

      expect(res.body.status).toBe('fail');
    });

    it('GET /api/v1/profile — 401 when token is invalid/garbage', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/profile')
        .set('Authorization', 'Bearer this.is.garbage')
        .expect(401);

      expect(res.body.status).toBe('fail');
    });

    it('GET /api/v1/profile/applications — 401 when no token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/profile/applications')
        .expect(401);

      expect(res.body.status).toBe('fail');
    });

    it('GET /api/v1/profile/bookmarks — 401 when no token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/profile/bookmarks')
        .expect(401);

      expect(res.body.status).toBe('fail');
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/profile
  // -------------------------------------------------------------------------
  describe('GET /api/v1/profile', () => {
    it('should return the authenticated user profile', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.status).toBe('success');
      expect(res.body.data).toHaveProperty('fullname', TEST_USER.fullname);
      expect(res.body.data).toHaveProperty('email', TEST_USER.email);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(res.body.data).not.toHaveProperty('password');
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/profile/applications
  // -------------------------------------------------------------------------
  describe('GET /api/v1/profile/applications', () => {
    it('should return empty paginated list when user has no applications', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/profile/applications')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.status).toBe('success');
      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.meta).toMatchObject({
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      });
    });

    it('should return 400 when page is not a positive integer', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/profile/applications?page=0')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);

      expect(res.body.status).toBe('fail');
    });

    it('should return 400 when limit exceeds 100', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/profile/applications?limit=101')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);

      expect(res.body.status).toBe('fail');
    });

    it('should use custom page and limit from query params', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/profile/applications?page=2&limit=5')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.data.meta.page).toBe(2);
      expect(res.body.data.meta.limit).toBe(5);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/profile/bookmarks
  // -------------------------------------------------------------------------
  describe('GET /api/v1/profile/bookmarks', () => {
    it('should return empty paginated list when user has no bookmarks', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/profile/bookmarks')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.status).toBe('success');
      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.meta).toMatchObject({
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      });
    });

    it('should return 400 when page is not a positive integer', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/profile/bookmarks?page=0')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);

      expect(res.body.status).toBe('fail');
    });

    it('should use custom page and limit from query params', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/profile/bookmarks?page=1&limit=20')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.data.meta.page).toBe(1);
      expect(res.body.data.meta.limit).toBe(20);
    });
  });
});
