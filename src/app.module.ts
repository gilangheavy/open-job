import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validate } from './config/env.config';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { CacheModule } from './modules/cache/cache.module';
import { UsersModule } from './modules/users/users.module';
import { AuthenticationsModule } from './modules/authentications/authentications.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { CustomThrottlerGuard } from './common/guards/throttler.guard';
import { THROTTLER_LIMITS } from './common/constants/throttler.constants';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),
    ThrottlerModule.forRoot([
      {
        limit: THROTTLER_LIMITS.global.limit,
        ttl: THROTTLER_LIMITS.global.ttl,
      },
    ]),
    PrismaModule,
    CacheModule,
    HealthModule,
    UsersModule,
    AuthenticationsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_GUARD, useClass: CustomThrottlerGuard },
  ],
})
export class AppModule {}
