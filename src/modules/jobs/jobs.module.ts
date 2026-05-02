import {
  MiddlewareConsumer,
  Module,
  NestModule,
} from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import type { NextFunction, Request, Response } from 'express';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

/**
 * Express re-parses req.query from req.url via a getter on every access.
 * To persist the mutation (company-name → companyName), we must replace the
 * getter with a plain writable property BEFORE the NestJS ValidationPipe reads
 * the query object.
 */
function companyNameQueryMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  // Snapshot the current query (triggers Express getter once)
  const rawQuery = req.query;
  const companyName = rawQuery['company-name'];

  if (companyName !== undefined) {
    const mutated: Record<string, unknown> = { ...rawQuery };
    mutated['companyName'] = companyName;
    delete mutated['company-name'];

    // Replace the Express getter with a stable plain property
    Object.defineProperty(req, 'query', {
      value: mutated,
      writable: true,
      configurable: true,
    });
  }

  next();
}

@Module({
  imports: [JwtModule.register({})],
  controllers: [JobsController],
  providers: [JobsService, JwtAuthGuard],
  exports: [JobsService],
})
export class JobsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(companyNameQueryMiddleware)
      .forRoutes(JobsController);
  }
}
