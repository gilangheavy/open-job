import { ExecutionContext, CallHandler } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import {
  CorrelationIdInterceptor,
  CORRELATION_ID_HEADER,
} from './correlation-id.interceptor';
import { uuidv7, UUID_V7_REGEX } from '../utils/uuid.util';

interface MockResponse {
  setHeader: jest.Mock;
  headers: Record<string, string>;
}

const buildContext = (
  requestHeaders: Record<string, string | string[] | undefined>,
  type: 'http' | 'rpc' = 'http',
): { context: ExecutionContext; response: MockResponse } => {
  const response: MockResponse = {
    headers: {},
    setHeader: jest.fn((key: string, value: string) => {
      response.headers[key] = value;
    }),
  };

  const context = {
    getType: () => type,
    switchToHttp: () => ({
      getRequest: () => ({ headers: requestHeaders }),
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;

  return { context, response };
};

const nextHandler: CallHandler = { handle: () => of('ok') };

describe('CorrelationIdInterceptor', () => {
  let interceptor: CorrelationIdInterceptor;

  beforeEach(() => {
    interceptor = new CorrelationIdInterceptor();
  });

  it('generates a UUID v7 when the header is absent', async () => {
    const { context, response } = buildContext({});

    await lastValueFrom(interceptor.intercept(context, nextHandler));

    expect(response.setHeader).toHaveBeenCalledTimes(1);
    const value = response.headers[CORRELATION_ID_HEADER];
    expect(value).toMatch(UUID_V7_REGEX);
  });

  it('reuses a valid client-provided UUID v7', async () => {
    const incoming = uuidv7();
    const { context, response } = buildContext({
      'x-correlation-id': incoming,
    });

    await lastValueFrom(interceptor.intercept(context, nextHandler));

    expect(response.headers[CORRELATION_ID_HEADER]).toBe(incoming);
  });

  it('regenerates when the client header is malformed', async () => {
    const { context, response } = buildContext({
      'x-correlation-id': 'not-a-uuid',
    });

    await lastValueFrom(interceptor.intercept(context, nextHandler));

    expect(response.headers[CORRELATION_ID_HEADER]).toMatch(UUID_V7_REGEX);
    expect(response.headers[CORRELATION_ID_HEADER]).not.toBe('not-a-uuid');
  });

  it('regenerates when the client header is a UUID v4 (not v7)', async () => {
    const v4 = '550e8400-e29b-41d4-a716-446655440000';
    const { context, response } = buildContext({ 'x-correlation-id': v4 });

    await lastValueFrom(interceptor.intercept(context, nextHandler));

    expect(response.headers[CORRELATION_ID_HEADER]).not.toBe(v4);
    expect(response.headers[CORRELATION_ID_HEADER]).toMatch(UUID_V7_REGEX);
  });

  it('handles array-typed headers by using the first element', async () => {
    const incoming = uuidv7();
    const { context, response } = buildContext({
      'x-correlation-id': [incoming, 'second'],
    });

    await lastValueFrom(interceptor.intercept(context, nextHandler));

    expect(response.headers[CORRELATION_ID_HEADER]).toBe(incoming);
  });

  it('skips processing for non-http contexts', async () => {
    const { context, response } = buildContext({}, 'rpc');

    await lastValueFrom(interceptor.intercept(context, nextHandler));

    expect(response.setHeader).not.toHaveBeenCalled();
  });
});
