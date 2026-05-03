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
import { ProfileModule } from './modules/profile/profile.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { ApplicationsModule } from './modules/applications/applications.module';
import { BookmarksModule } from './modules/bookmarks/bookmarks.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { QueueModule } from './modules/queue/queue.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { CustomThrottlerGuard } from './common/guards/throttler.guard';
import { THROTTLER_LIMITS } from './common/constants/throttler.constants';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),
    ThrottlerModule.forRoot({
      // Skip throttling outside production so Newman / integration test suites
      // are not rate-limited by the strict per-endpoint caps.
      skipIf: () => process.env.NODE_ENV !== 'production',
      throttlers: [
        {
          limit: THROTTLER_LIMITS.global.limit,
          ttl: THROTTLER_LIMITS.global.ttl,
        },
      ],
    }),
    PrismaModule,
    CacheModule,
    HealthModule,
    UsersModule,
    AuthenticationsModule,
    ProfileModule,
    CompaniesModule,
    CategoriesModule,
    JobsModule,
    QueueModule,
    ApplicationsModule,
    BookmarksModule,
    DocumentsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_GUARD, useClass: CustomThrottlerGuard },
  ],
})
export class AppModule {}
