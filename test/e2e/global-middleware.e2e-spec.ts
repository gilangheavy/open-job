import { Test, TestingModule } from '@nestjs/testing';
import {
  Controller,
  Get,
  INestApplication,
  Module,
  ValidationPipe,
} from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, Throttle } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';
import { CorrelationIdInterceptor } from '../../src/common/interceptors/correlation-id.interceptor';
import { CustomThrottlerGuard } from '../../src/common/guards/throttler.guard';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { THROTTLER_LIMITS } from '../../src/common/constants/throttler.constants';
import { UUID_V7_REGEX } from '../../src/common/utils/uuid.util';

@Controller('test')
class TestController {
  @Get('open')
  open() {
    return { ok: true };
  }

  @Get('strict')
  @Throttle({
    default: {
      limit: THROTTLER_LIMITS.strict.limit,
      ttl: THROTTLER_LIMITS.strict.ttl,
    },
  })
  strict() {
    return { ok: true };
  }
}

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        limit: THROTTLER_LIMITS.global.limit,
        ttl: THROTTLER_LIMITS.global.ttl,
      },
    ]),
  ],
  controllers: [TestController],
  providers: [
    { provide: APP_GUARD, useClass: CustomThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: CorrelationIdInterceptor },
  ],
})
class TestAppModule {}

describe('Global middleware (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [TestAppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('attaches an X-Correlation-ID UUID v7 to every response', async () => {
    const res = await request(app.getHttpServer())
      .get('/test/open')
      .expect(200);

    const header = res.headers['x-correlation-id'];
    expect(typeof header).toBe('string');
    expect(header).toMatch(UUID_V7_REGEX);
  });

  it('reuses a valid client-supplied X-Correlation-ID', async () => {
    const supplied = '01900000-0000-7000-8000-000000000abc';
    const res = await request(app.getHttpServer())
      .get('/test/open')
      .set('X-Correlation-ID', supplied)
      .expect(200);

    expect(res.headers['x-correlation-id']).toBe(supplied);
  });

  it('returns 429 with FailResponse shape after exceeding the strict throttle (5/min)', async () => {
    const agent = request(app.getHttpServer());
    for (let i = 0; i < 5; i += 1) {
      await agent.get('/test/strict').expect(200);
    }

    const blocked = await agent.get('/test/strict').expect(429);
    expect(blocked.body).toEqual({
      status: 'fail',
      message: 'Too Many Requests',
    });
  });

  it('allows more than 5 requests for unmarked routes, using global fallback limit', async () => {
    const agent = request(app.getHttpServer());
    for (let i = 0; i < 6; i += 1) {
      await agent.get('/test/open').expect(200);
    }
  });
});
