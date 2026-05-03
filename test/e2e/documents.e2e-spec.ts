import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { ThrottlerStorage } from '@nestjs/throttler';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { CacheService } from '../../src/modules/cache/cache.service';
import { QueueService } from '../../src/modules/queue/queue.service';
import { S3Service } from '../../src/modules/documents/s3.service';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';

const getRandomString = () => Math.random().toString(36).substring(7);

const PRESIGNED_URL =
  'https://minio.example.com/openjob/documents/key.pdf?X-Amz-Signature=abc';

const makeUser = () => ({
  fullname: `User ${getRandomString()}`,
  email: `user_${getRandomString()}@example.com`,
  password: 'StrongPassword123!',
});

const makePdfBuffer = () => Buffer.from('%PDF-1.4 fake pdf content');

async function registerAndLogin(
  app: INestApplication<App>,
): Promise<{ token: string }> {
  const user = makeUser();
  await request(app.getHttpServer())
    .post('/api/v1/users')
    .send(user)
    .expect(201);

  const res = await request(app.getHttpServer())
    .post('/api/v1/authentications')
    .send({ email: user.email, password: user.password })
    .expect(201);

  return { token: res.body.data.accessToken as string };
}

describe('DocumentsController (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let cache: CacheService;
  let mockS3: jest.Mocked<
    Pick<S3Service, 'uploadFile' | 'deleteFile' | 'getPresignedUrl'>
  >;

  beforeAll(async () => {
    mockS3 = {
      uploadFile: jest.fn().mockResolvedValue('documents/uuid/123-resume.pdf'),
      deleteFile: jest.fn().mockResolvedValue(undefined),
      getPresignedUrl: jest.fn().mockResolvedValue(PRESIGNED_URL),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ThrottlerStorage)
      .useValue({
        increment: jest.fn().mockResolvedValue({
          totalHits: 0,
          timeToExpire: 9999,
          isBlocked: false,
          timeToBlockExpire: 0,
        }),
      })
      .overrideProvider(QueueService)
      .useValue({
        publish: jest.fn(),
        onModuleInit: jest.fn(),
        onModuleDestroy: jest.fn(),
      })
      .overrideProvider(S3Service)
      .useValue(mockS3)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());

    prisma = moduleFixture.get(PrismaService);
    cache = moduleFixture.get(CacheService);

    await app.init();
  });

  afterAll(async () => {
    await prisma.$executeRaw`DELETE FROM documents`;
    await prisma.client.authentication.deleteMany({});
    await prisma.client.user.deleteMany({});
    await app.close();
  });

  afterEach(async () => {
    await prisma.$executeRaw`DELETE FROM documents`;
    await prisma.client.authentication.deleteMany({});
    await prisma.client.user.deleteMany({});
    await cache.delPattern('documents:*');
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // POST /api/v1/documents
  // -----------------------------------------------------------------------
  describe('POST /api/v1/documents', () => {
    it('should upload a PDF and return 201 with presigned URL (AC: upload success)', async () => {
      const { token } = await registerAndLogin(app);

      const res = await request(app.getHttpServer())
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', makePdfBuffer(), {
          filename: 'resume.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);

      expect(res.body.status).toBe('success');
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.presignedUrl).toBe(PRESIGNED_URL);
      expect(res.body.data.originalName).toBe('resume.pdf');
      expect(res.body.data.mimeType).toBe('application/pdf');
      expect(typeof res.body.data.id).toBe('string');
      expect(res.body.data.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(mockS3.uploadFile).toHaveBeenCalledTimes(1);
    });

    it('should return 400 when MIME type is not application/pdf (AC: invalid MIME)', async () => {
      const { token } = await registerAndLogin(app);

      const res = await request(app.getHttpServer())
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.from('fake image'), {
          filename: 'photo.png',
          contentType: 'image/png',
        })
        .expect(400);

      expect(res.body.status).toBe('fail');
      expect(mockS3.uploadFile).not.toHaveBeenCalled();
    });

    it('should return 400 when file exceeds 5MB (AC: file too large)', async () => {
      const { token } = await registerAndLogin(app);
      const bigBuffer = Buffer.alloc(6 * 1024 * 1024, 'a'); // 6MB

      const res = await request(app.getHttpServer())
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', bigBuffer, {
          filename: 'big.pdf',
          contentType: 'application/pdf',
        })
        .expect(400);

      expect(res.body.status).toBe('fail');
      expect(mockS3.uploadFile).not.toHaveBeenCalled();
    });

    it('should return 401 when unauthenticated', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/documents')
        .attach('file', makePdfBuffer(), {
          filename: 'resume.pdf',
          contentType: 'application/pdf',
        })
        .expect(401);
    });

    it('should not expose integer id in response (AC: no integer id leak)', async () => {
      const { token } = await registerAndLogin(app);

      const res = await request(app.getHttpServer())
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', makePdfBuffer(), {
          filename: 'resume.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);

      expect(res.body.data).not.toHaveProperty('filename');
      // id must be a UUID string, not an integer
      expect(typeof res.body.data.id).toBe('string');
      expect(res.body.data.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/documents
  // -----------------------------------------------------------------------
  describe('GET /api/v1/documents', () => {
    it('should return paginated list of documents (200, public)', async () => {
      const { token } = await registerAndLogin(app);

      // Upload one document first
      await request(app.getHttpServer())
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', makePdfBuffer(), {
          filename: 'resume.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/v1/documents')
        .expect(200);

      expect(res.body.status).toBe('success');
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.meta.total).toBe(1);
      expect(res.body.data.meta.page).toBe(1);
      expect(res.body.data.items[0].presignedUrl).toBe(PRESIGNED_URL);
    });

    it('should return empty list when no documents exist (200)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/documents')
        .expect(200);

      expect(res.body.status).toBe('success');
      expect(res.body.data.items).toHaveLength(0);
      expect(res.body.data.meta.total).toBe(0);
    });

    it('should support pagination via query params', async () => {
      const { token } = await registerAndLogin(app);

      // Upload 2 documents
      for (let i = 0; i < 2; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/documents')
          .set('Authorization', `Bearer ${token}`)
          .attach('file', makePdfBuffer(), {
            filename: `resume-${i}.pdf`,
            contentType: 'application/pdf',
          })
          .expect(201);
      }

      const res = await request(app.getHttpServer())
        .get('/api/v1/documents?page=1&limit=1')
        .expect(200);

      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.meta.total).toBe(2);
      expect(res.body.data.meta.totalPages).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/documents/:uuid
  // -----------------------------------------------------------------------
  describe('GET /api/v1/documents/:uuid', () => {
    it('should return document with presigned URL (200, public, AC: valid presigned URL)', async () => {
      const { token } = await registerAndLogin(app);

      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', makePdfBuffer(), {
          filename: 'resume.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);

      const docId = uploadRes.body.data.id as string;

      const res = await request(app.getHttpServer())
        .get(`/api/v1/documents/${docId}`)
        .expect(200);

      expect(res.body.status).toBe('success');
      expect(res.body.data.id).toBe(docId);
      expect(res.body.data.presignedUrl).toBe(PRESIGNED_URL);
    });

    it('should set X-Data-Source: database on first fetch', async () => {
      const { token } = await registerAndLogin(app);

      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', makePdfBuffer(), {
          filename: 'resume.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);

      const docId = uploadRes.body.data.id as string;

      const res = await request(app.getHttpServer())
        .get(`/api/v1/documents/${docId}`)
        .expect(200);

      expect(res.headers['x-data-source']).toBe('database');
    });

    it('should set X-Data-Source: cache on subsequent fetch', async () => {
      const { token } = await registerAndLogin(app);

      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', makePdfBuffer(), {
          filename: 'resume.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);

      const docId = uploadRes.body.data.id as string;

      // First fetch primes the cache
      await request(app.getHttpServer())
        .get(`/api/v1/documents/${docId}`)
        .expect(200);

      // Second fetch should come from cache
      const res = await request(app.getHttpServer())
        .get(`/api/v1/documents/${docId}`)
        .expect(200);

      expect(res.headers['x-data-source']).toBe('cache');
    });

    it('should return 404 for non-existent UUID', async () => {
      const nonExistentId = '00000000-0000-7000-8000-000000000000';

      const res = await request(app.getHttpServer())
        .get(`/api/v1/documents/${nonExistentId}`)
        .expect(404);

      expect(res.body.status).toBe('fail');
    });

    it('should return 404 for invalid UUID format', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/documents/not-a-uuid')
        .expect(404);

      expect(res.body.status).toBe('fail');
    });
  });

  // -----------------------------------------------------------------------
  // DELETE /api/v1/documents/:uuid
  // -----------------------------------------------------------------------
  describe('DELETE /api/v1/documents/:uuid', () => {
    it('should delete document and return success (200, AC: delete cleans S3 + DB)', async () => {
      const { token } = await registerAndLogin(app);

      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', makePdfBuffer(), {
          filename: 'resume.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);

      const docId = uploadRes.body.data.id as string;

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/documents/${docId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.status).toBe('success');
      expect(res.body.message).toBe('Document deleted successfully');
      expect(mockS3.deleteFile).toHaveBeenCalledTimes(1);
    });

    it('should return 404 after deletion (AC: no longer accessible)', async () => {
      const { token } = await registerAndLogin(app);

      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', makePdfBuffer(), {
          filename: 'resume.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);

      const docId = uploadRes.body.data.id as string;

      await request(app.getHttpServer())
        .delete(`/api/v1/documents/${docId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Document should no longer be accessible
      await request(app.getHttpServer())
        .get(`/api/v1/documents/${docId}`)
        .expect(404);
    });

    it('should return 403 when another user tries to delete (AC: ownership check)', async () => {
      const { token: ownerToken } = await registerAndLogin(app);
      const { token: otherToken } = await registerAndLogin(app);

      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${ownerToken}`)
        .attach('file', makePdfBuffer(), {
          filename: 'resume.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);

      const docId = uploadRes.body.data.id as string;

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/documents/${docId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);

      expect(res.body.status).toBe('fail');
      expect(mockS3.deleteFile).not.toHaveBeenCalled();
    });

    it('should return 401 when unauthenticated', async () => {
      const { token } = await registerAndLogin(app);

      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', makePdfBuffer(), {
          filename: 'resume.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);

      const docId = uploadRes.body.data.id as string;

      await request(app.getHttpServer())
        .delete(`/api/v1/documents/${docId}`)
        .expect(401);
    });

    it('should return 404 for non-existent document UUID', async () => {
      const { token } = await registerAndLogin(app);
      const nonExistentId = '00000000-0000-7000-8000-000000000000';

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/documents/${nonExistentId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      expect(res.body.status).toBe('fail');
    });
  });
});
