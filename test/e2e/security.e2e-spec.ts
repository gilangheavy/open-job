import { Test, TestingModule } from '@nestjs/testing';
import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import helmet from 'helmet';
import request from 'supertest';
import { App } from 'supertest/types';

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

describe('Security middleware (e2e)', () => {
  describe('Helmet headers', () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [SecurityTestModule],
      }).compile();

      app = moduleRef.createNestApplication();
      app.use(helmet());
      await app.init();
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
});
