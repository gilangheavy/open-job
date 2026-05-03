import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DocumentsService } from './documents.service';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from './s3.service';
import { CacheService } from '../cache/cache.service';
import { DocumentResponseDto } from './dto/document-response.dto';

const USER_UUID = '111e8400-e29b-41d4-a716-446655440001';
const OTHER_UUID = '222e8400-e29b-41d4-a716-446655440002';
const DOC_UUID = '330e8400-e29b-41d4-a716-446655440003';
const PRESIGNED_URL = 'https://minio/openjob/documents/key.pdf?sig=abc';

const mockUser = {
  id: 1,
  uuid: USER_UUID,
  fullname: 'Test User',
  email: 'user@example.com',
  password: 'hashed',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  deletedAt: null,
};

const mockDocument = {
  id: 1,
  uuid: DOC_UUID,
  userId: 1,
  filename: 'documents/111e/1234-resume.pdf',
  originalName: 'resume.pdf',
  mimeType: 'application/pdf',
  size: 512000,
  url: 'documents/111e/1234-resume.pdf',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  user: mockUser,
};

const mockDocumentResponse: DocumentResponseDto = {
  id: DOC_UUID,
  userId: USER_UUID,
  originalName: 'resume.pdf',
  mimeType: 'application/pdf',
  size: 512000,
  presignedUrl: PRESIGNED_URL,
  createdAt: mockDocument.createdAt,
  updatedAt: mockDocument.updatedAt,
};

describe('DocumentsService', () => {
  let service: DocumentsService;
  let prisma: {
    client: {
      document: {
        create: jest.Mock;
        findMany: jest.Mock;
        count: jest.Mock;
        findUnique: jest.Mock;
        delete: jest.Mock;
      };
      user: { findUnique: jest.Mock };
    };
  };
  let s3: jest.Mocked<S3Service>;
  let cache: jest.Mocked<CacheService>;

  beforeEach(async () => {
    prisma = {
      client: {
        document: {
          create: jest.fn(),
          findMany: jest.fn(),
          count: jest.fn(),
          findUnique: jest.fn(),
          delete: jest.fn(),
        },
        user: { findUnique: jest.fn() },
      },
    };

    s3 = {
      uploadFile: jest.fn(),
      deleteFile: jest.fn(),
      getPresignedUrl: jest.fn(),
    } as unknown as jest.Mocked<S3Service>;

    cache = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      delPattern: jest.fn(),
    } as unknown as jest.Mocked<CacheService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: S3Service, useValue: s3 },
        { provide: CacheService, useValue: cache },
      ],
    }).compile();

    service = module.get<DocumentsService>(DocumentsService);
  });

  afterEach(() => jest.clearAllMocks());

  // -----------------------------------------------------------------------
  // upload (POST /documents)
  // -----------------------------------------------------------------------
  describe('upload()', () => {
    const makeFile = (
      overrides: Partial<Express.Multer.File> = {},
    ): Express.Multer.File =>
      ({
        fieldname: 'file',
        originalname: 'resume.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        buffer: Buffer.from('pdf-content'),
        size: 512000,
        ...overrides,
      }) as Express.Multer.File;

    it('should upload file, persist metadata, and return response with presigned URL', async () => {
      const file = makeFile();
      prisma.client.user.findUnique.mockResolvedValueOnce(mockUser);
      s3.uploadFile.mockResolvedValueOnce('documents/111e/1234-resume.pdf');
      prisma.client.document.create.mockResolvedValueOnce(mockDocument);
      s3.getPresignedUrl.mockResolvedValueOnce(PRESIGNED_URL);

      const result = await service.upload(USER_UUID, file);

      expect(s3.uploadFile).toHaveBeenCalledTimes(1);
      expect(prisma.client.document.create).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject<Partial<DocumentResponseDto>>({
        id: DOC_UUID,
        userId: USER_UUID,
        presignedUrl: PRESIGNED_URL,
      });
    });

    it('should throw BadRequestException when MIME type is not application/pdf', async () => {
      const file = makeFile({ mimetype: 'image/png' });

      await expect(service.upload(USER_UUID, file)).rejects.toThrow(
        BadRequestException,
      );
      expect(s3.uploadFile).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when file size exceeds 5MB', async () => {
      const file = makeFile({ size: 6 * 1024 * 1024 }); // 6MB

      await expect(service.upload(USER_UUID, file)).rejects.toThrow(
        BadRequestException,
      );
      expect(s3.uploadFile).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when user does not exist', async () => {
      prisma.client.user.findUnique.mockResolvedValueOnce(null);

      await expect(service.upload(USER_UUID, makeFile())).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -----------------------------------------------------------------------
  // findAll (GET /documents)
  // -----------------------------------------------------------------------
  describe('findAll()', () => {
    it('should return paginated documents with presigned URLs', async () => {
      prisma.client.document.count.mockResolvedValueOnce(1);
      prisma.client.document.findMany.mockResolvedValueOnce([mockDocument]);
      s3.getPresignedUrl.mockResolvedValue(PRESIGNED_URL);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result.items).toHaveLength(1);
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 10, totalPages: 1 });
      expect(result.items[0].presignedUrl).toBe(PRESIGNED_URL);
    });
  });

  // -----------------------------------------------------------------------
  // findByUuid (GET /documents/:uuid)
  // -----------------------------------------------------------------------
  describe('findByUuid()', () => {
    it('should return document from cache when available', async () => {
      cache.get.mockResolvedValueOnce(mockDocumentResponse);

      const { data, source } = await service.findByUuid(DOC_UUID);

      expect(source).toBe('cache');
      expect(data).toEqual(mockDocumentResponse);
      expect(prisma.client.document.findUnique).not.toHaveBeenCalled();
    });

    it('should fetch from DB, cache result, and return with presigned URL', async () => {
      cache.get.mockResolvedValueOnce(null);
      prisma.client.document.findUnique.mockResolvedValueOnce(mockDocument);
      s3.getPresignedUrl.mockResolvedValueOnce(PRESIGNED_URL);

      const { data, source } = await service.findByUuid(DOC_UUID);

      expect(source).toBe('database');
      expect(data.presignedUrl).toBe(PRESIGNED_URL);
      expect(cache.set).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException for unknown UUID', async () => {
      cache.get.mockResolvedValueOnce(null);
      prisma.client.document.findUnique.mockResolvedValueOnce(null);

      await expect(service.findByUuid(DOC_UUID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException for invalid UUID format', async () => {
      await expect(service.findByUuid('not-a-uuid')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -----------------------------------------------------------------------
  // remove (DELETE /documents/:uuid)
  // -----------------------------------------------------------------------
  describe('remove()', () => {
    it('should delete S3 object, DB record, and invalidate cache', async () => {
      prisma.client.document.findUnique.mockResolvedValueOnce(mockDocument);
      prisma.client.document.delete.mockResolvedValueOnce(mockDocument);

      await service.remove(DOC_UUID, USER_UUID);

      expect(s3.deleteFile).toHaveBeenCalledWith(mockDocument.url);
      expect(prisma.client.document.delete).toHaveBeenCalledTimes(1);
      expect(cache.del).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException when document does not exist', async () => {
      prisma.client.document.findUnique.mockResolvedValueOnce(null);

      await expect(service.remove(DOC_UUID, USER_UUID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when requester is not the owner', async () => {
      prisma.client.document.findUnique.mockResolvedValueOnce(mockDocument);

      await expect(service.remove(DOC_UUID, OTHER_UUID)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
