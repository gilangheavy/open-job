import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { ThrottlerStorage } from '@nestjs/throttler';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';

const TEST_USER = {
  fullname: 'Auth Test User',
  email: `auth_test_${Date.now()}@example.com`,
  password: 'StrongPassword123!',
};

describe('AuthenticationsController (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      // Override the throttler storage so no request is ever rate-limited
      // during E2E tests. Throttle behaviour is tested separately in
      // global-middleware.e2e-spec.ts.
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
    // Register the same global filter used in main.ts so error shape is consistent
    app.useGlobalFilters(new AllExceptionsFilter());

    await app.init();

    prisma = app.get(PrismaService);

    // Seed a user for all auth tests
    await request(app.getHttpServer())
      .post('/api/v1/users')
      .send(TEST_USER)
      .expect(201);
  });

  afterAll(async () => {
    await prisma.client.authentication.deleteMany({});
    await prisma.client.user.deleteMany({ where: { email: TEST_USER.email } });
    await app.close();
  });

  // -----------------------------------------------------------------------
  // POST /api/v1/authentications — login
  // -----------------------------------------------------------------------
  describe('POST /api/v1/authentications', () => {
    it('should return 400 for missing email and password', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/authentications')
        .send({})
        .expect(400);

      expect(res.body.status).toBe('fail');
      expect(res.body.message).toBeDefined();
    });

    it('should return 400 for invalid email format', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/authentications')
        .send({ email: 'not-an-email', password: 'password123' })
        .expect(400);

      expect(res.body.status).toBe('fail');
    });

    it('should return 400 for missing password', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/authentications')
        .send({ email: TEST_USER.email })
        .expect(400);

      expect(res.body.status).toBe('fail');
    });

    it('should return 401 for non-existent email', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/authentications')
        .send({ email: 'nobody@example.com', password: 'password123' })
        .expect(401);

      expect(res.body.status).toBe('fail');
      expect(res.body.message).toBeDefined();
    });

    it('should return 401 for wrong password', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/authentications')
        .send({ email: TEST_USER.email, password: 'wrong_password' })
        .expect(401);

      expect(res.body.status).toBe('fail');
      expect(res.body.message).toBeDefined();
    });

    it('should return 201 with accessToken and refreshToken on valid credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/authentications')
        .send({ email: TEST_USER.email, password: TEST_USER.password })
        .expect(201);

      expect(res.body.status).toBe('success');
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('refreshToken');
      expect(typeof res.body.data.accessToken).toBe('string');
      expect(typeof res.body.data.refreshToken).toBe('string');
    });

    it('should persist the refresh token in the database', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/authentications')
        .send({ email: TEST_USER.email, password: TEST_USER.password })
        .expect(201);

      const { refreshToken } = res.body.data as {
        accessToken: string;
        refreshToken: string;
      };

      const stored = await prisma.client.authentication.findUnique({
        where: { token: refreshToken },
      });

      expect(stored).not.toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // PUT /api/v1/authentications — refresh
  // -----------------------------------------------------------------------
  describe('PUT /api/v1/authentications', () => {
    let validRefreshToken: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/authentications')
        .send({ email: TEST_USER.email, password: TEST_USER.password })
        .expect(201);

      validRefreshToken = (
        res.body.data as { accessToken: string; refreshToken: string }
      ).refreshToken;
    });

    it('should return 400 for empty payload', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/authentications')
        .send({})
        .expect(400);

      expect(res.body.status).toBe('fail');
    });

    it('should return 401 for an invalid (garbage) refresh token', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/authentications')
        .send({ refreshToken: 'this.is.garbage' })
        .expect(401);

      expect(res.body.status).toBe('fail');
    });

    it('should return 401 when using an access token as refresh token', async () => {
      // Login to get an access token
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/authentications')
        .send({ email: TEST_USER.email, password: TEST_USER.password })
        .expect(201);

      const { accessToken } = loginRes.body.data as {
        accessToken: string;
        refreshToken: string;
      };

      const res = await request(app.getHttpServer())
        .put('/api/v1/authentications')
        .send({ refreshToken: accessToken })
        .expect(401);

      expect(res.body.status).toBe('fail');
    });

    it('should return 401 for a refresh token not present in DB', async () => {
      // Delete it first
      await prisma.client.authentication.deleteMany({
        where: { token: validRefreshToken },
      });

      const res = await request(app.getHttpServer())
        .put('/api/v1/authentications')
        .send({ refreshToken: validRefreshToken })
        .expect(401);

      expect(res.body.status).toBe('fail');
    });

    it('should return 200 with a new accessToken for a valid refresh token', async () => {
      // Get a fresh refresh token
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/authentications')
        .send({ email: TEST_USER.email, password: TEST_USER.password })
        .expect(201);

      const { refreshToken } = loginRes.body.data as {
        accessToken: string;
        refreshToken: string;
      };

      const res = await request(app.getHttpServer())
        .put('/api/v1/authentications')
        .send({ refreshToken })
        .expect(200);

      expect(res.body.status).toBe('success');
      expect(res.body.data).toHaveProperty('accessToken');
      expect(typeof res.body.data.accessToken).toBe('string');
    });
  });

  // -----------------------------------------------------------------------
  // DELETE /api/v1/authentications — logout
  // -----------------------------------------------------------------------
  describe('DELETE /api/v1/authentications', () => {
    it('should return 400 for empty payload', async () => {
      const res = await request(app.getHttpServer())
        .delete('/api/v1/authentications')
        .send({})
        .expect(400);

      expect(res.body.status).toBe('fail');
    });

    it('should return 200 and remove the refresh token from the database', async () => {
      // Login to get tokens
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/authentications')
        .send({ email: TEST_USER.email, password: TEST_USER.password })
        .expect(201);

      const { refreshToken } = loginRes.body.data as {
        accessToken: string;
        refreshToken: string;
      };

      const res = await request(app.getHttpServer())
        .delete('/api/v1/authentications')
        .send({ refreshToken })
        .expect(200);

      expect(res.body.status).toBe('success');
      expect(res.body.message).toBeDefined();

      // Verify token removed from DB
      const stored = await prisma.client.authentication.findUnique({
        where: { token: refreshToken },
      });
      expect(stored).toBeNull();
    });

    it('should return 200 even when refresh token does not exist (idempotent logout)', async () => {
      const res = await request(app.getHttpServer())
        .delete('/api/v1/authentications')
        .send({ refreshToken: 'non_existent_token_xyz' })
        .expect(200);

      expect(res.body.status).toBe('success');
    });
  });
});
