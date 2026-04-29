import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Request, Response } from 'express';
import { uuidv7, isUuidV7 } from '../utils/uuid.util';

export const CORRELATION_ID_HEADER = 'X-Correlation-ID';

@Injectable()
export class CorrelationIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const incoming = request.headers['x-correlation-id'];
    const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
    const correlationId = isUuidV7(candidate) ? candidate : uuidv7();

    response.setHeader(CORRELATION_ID_HEADER, correlationId);

    return next.handle();
  }
}
