import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { CacheService } from '../../src/modules/cache/cache.service';

const getRandomString = () => Math.random().toString(36).substring(7);

describe('UsersController (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let cache: CacheService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );

    prisma = app.get(PrismaService);
    cache = app.get(CacheService);

    await app.init();
  });

  afterAll(async () => {
    await prisma.client.user.deleteMany({});
    await app.close();
  });

  afterEach(async () => {
    await prisma.client.user.deleteMany({});
  });

  describe('POST /api/v1/users', () => {
    it('should successfully register a new user and not return password or integer id', async () => {
      const payload = {
        fullname: `User ${getRandomString()}`,
        email: `user_${getRandomString()}@example.com`,
        password: 'StrongPassword123!',
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/users')
        .send(payload)
        .expect(201);

      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(typeof response.body.data.id).toBe('string');
      expect(response.body.data).not.toHaveProperty('password');
      expect(response.body.data).toHaveProperty('fullname', payload.fullname);
      expect(response.body.data).toHaveProperty('email', payload.email);
    });

    it('should return 409 when email is duplicated', async () => {
      const payload = {
        fullname: `User ${getRandomString()}`,
        email: `user_${getRandomString()}@example.com`,
        password: 'StrongPassword123!',
      };

      await request(app.getHttpServer())
        .post('/api/v1/users')
        .send(payload)
        .expect(201);

      const response = await request(app.getHttpServer())
        .post('/api/v1/users')
        .send(payload)
        .expect(409);

      expect(response.body.message).toBe('Email already registered');
    });
  });

  describe('GET /api/v1/users/:uuid', () => {
    it('should return public profile and cache the second hit', async () => {
      const payload = {
        fullname: `User ${getRandomString()}`,
        email: `user_${getRandomString()}@example.com`,
        password: 'StrongPassword123!',
      };

      // Register first
      const createResponse = await request(app.getHttpServer())
        .post('/api/v1/users')
        .send(payload)
        .expect(201);

      const uuid = createResponse.body.data.id;

      // Ensure cache is empty for this user initially
      await cache.del(`users:${uuid}`);

      // First hit -> database
      const firstHit = await request(app.getHttpServer())
        .get(`/api/v1/users/${uuid}`)
        .expect(200);

      expect(firstHit.headers['x-data-source']).toBe('database');
      expect(firstHit.body.data).toHaveProperty('id', uuid);
      expect(firstHit.body.data).not.toHaveProperty('password');

      // Second hit -> cache
      const secondHit = await request(app.getHttpServer())
        .get(`/api/v1/users/${uuid}`)
        .expect(200);

      expect(secondHit.headers['x-data-source']).toBe('cache');
      expect(secondHit.body.data).toHaveProperty('id', uuid);
      expect(secondHit.body.data).not.toHaveProperty('password');
    });

    it('should return 404 for invalid uuid format', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users/invalid-uuid')
        .expect(404);
    });
  });
});
