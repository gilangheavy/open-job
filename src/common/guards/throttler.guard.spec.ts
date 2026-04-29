import { HttpException, HttpStatus, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerStorageService } from '@nestjs/throttler';
import { CustomThrottlerGuard } from './throttler.guard';

describe('CustomThrottlerGuard', () => {
  let guard: CustomThrottlerGuard;

  beforeEach(() => {
    guard = new CustomThrottlerGuard(
      { throttlers: [{ ttl: 60_000, limit: 100 }] },
      new ThrottlerStorageService(),
      new Reflector(),
    );
  });

  describe('throwThrottlingException', () => {
    it('throws HttpException with 429 status and "Too Many Requests" message', async () => {
      const context = {} as ExecutionContext;
      const detail = {
        ttl: 60_000,
        limit: 100,
        key: 'k',
        tracker: 't',
        totalHits: 101,
        timeToExpire: 30,
        isBlocked: false,
        timeToBlockExpire: 0,
      };

      await expect(
        // @ts-expect-error — accessing protected method for unit test
        guard.throwThrottlingException(context, detail),
      ).rejects.toThrow(HttpException);

      try {
        // @ts-expect-error — accessing protected method for unit test
        await guard.throwThrottlingException(context, detail);
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        const httpErr = err as HttpException;
        expect(httpErr.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
        expect(httpErr.message).toBe('Too Many Requests');
      }
    });

    it('produces the FailResponse shape via AllExceptionsFilter contract', async () => {
      const detail = {
        ttl: 60_000,
        limit: 100,
        key: 'k',
        tracker: 't',
        totalHits: 101,
        timeToExpire: 30,
        isBlocked: false,
        timeToBlockExpire: 0,
      };

      try {
        // @ts-expect-error — accessing protected method for unit test
        await guard.throwThrottlingException({} as ExecutionContext, detail);
        fail('expected throw');
      } catch (err) {
        // The thrown exception flows through AllExceptionsFilter, which maps
        // 4xx HttpException to { status: 'fail', message }. We just assert the
        // exception carries the right primitives so the filter outputs the
        // required shape.
        const httpErr = err as HttpException;
        expect(httpErr.getStatus()).toBeLessThan(500);
        expect(httpErr.getStatus()).toBeGreaterThanOrEqual(400);
        expect(httpErr.message).toBe('Too Many Requests');
      }
    });
  });
});
