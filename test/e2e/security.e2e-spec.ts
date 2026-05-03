import { Test, TestingModule } from '@nestjs/testing';
import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import helmet from 'helmet';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  applyCorsConfig,
  parseCorsOrigins,
} from '../../src/config/cors.config';

@Controller('test')
class SecurityTestController {
  @Get('ping')
  ping() {
    return { ok: true };
  }
}

@Module({
  controllers: [SecurityTestController],
})
class SecurityTestModule {}

async function bootstrapSecurityApp(
  corsOrigin?: string,
): Promise<INestApplication<App>> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [SecurityTestModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.use(helmet());
  applyCorsConfig(app, corsOrigin);
  await app.init();
  return app;
}

describe('Security middleware (e2e)', () => {
  describe('Helmet headers', () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      app = await bootstrapSecurityApp();
    });

    afterAll(async () => {
      await app.close();
    });

    it('attaches X-Content-Type-Options: nosniff', async () => {
      const res = await request(app.getHttpServer())
        .get('/test/ping')
        .expect(200);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('attaches X-Frame-Options: SAMEORIGIN', async () => {
      const res = await request(app.getHttpServer())
        .get('/test/ping')
        .expect(200);
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    });

    it('attaches Strict-Transport-Security header', async () => {
      const res = await request(app.getHttpServer())
        .get('/test/ping')
        .expect(200);
      expect(res.headers['strict-transport-security']).toBeDefined();
    });

    it('removes the X-Powered-By header', async () => {
      const res = await request(app.getHttpServer())
        .get('/test/ping')
        .expect(200);
      expect(res.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('parseCorsOrigins()', () => {
    it('returns "*" for undefined / empty / "*"', () => {
      expect(parseCorsOrigins(undefined)).toBe('*');
      expect(parseCorsOrigins('')).toBe('*');
      expect(parseCorsOrigins('*')).toBe('*');
    });

    it('splits a comma-separated list and trims whitespace', () => {
      expect(
        parseCorsOrigins('https://a.example.com, https://b.example.com'),
      ).toEqual(['https://a.example.com', 'https://b.example.com']);
    });
  });

  describe('CORS whitelist', () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      app = await bootstrapSecurityApp(
        'https://allowed.example.com,https://admin.example.com',
      );
    });

    afterAll(async () => {
      await app.close();
    });

    it('allows requests from a whitelisted origin', async () => {
      const res = await request(app.getHttpServer())
        .get('/test/ping')
        .set('Origin', 'https://allowed.example.com')
        .expect(200);
      expect(res.headers['access-control-allow-origin']).toBe(
        'https://allowed.example.com',
      );
    });

    it('rejects requests from a non-whitelisted origin with 403 + FailResponse shape', async () => {
      const res = await request(app.getHttpServer())
        .get('/test/ping')
        .set('Origin', 'https://evil.example.com')
        .expect(403);
      expect(res.body).toEqual({
        status: 'fail',
        message: 'CORS: origin not allowed',
      });
    });

    it('passes through same-origin requests (no Origin header)', async () => {
      await request(app.getHttpServer()).get('/test/ping').expect(200);
    });
  });

  describe('CORS wildcard mode', () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      app = await bootstrapSecurityApp('*');
    });

    afterAll(async () => {
      await app.close();
    });

    it('allows any origin when CORS_ORIGIN is "*"', async () => {
      const res = await request(app.getHttpServer())
        .get('/test/ping')
        .set('Origin', 'https://anything.example.com')
        .expect(200);
      expect(res.headers['access-control-allow-origin']).toBeDefined();
    });
  });
});
