import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../../common/guards/jwt-auth.guard';
import { DocumentResponseDto } from './dto/document-response.dto';
import type { PaginatedResult } from '../profile/dto/pagination-query.dto';

const USER_UUID = '111e8400-e29b-41d4-a716-446655440001';
const DOC_UUID = '330e8400-e29b-41d4-a716-446655440003';
const PRESIGNED_URL = 'https://minio/openjob/documents/key.pdf?sig=abc';

const mockUser: JwtPayload = { id: USER_UUID };

const mockDocumentResponse: DocumentResponseDto = {
  id: DOC_UUID,
  userId: USER_UUID,
  originalName: 'resume.pdf',
  mimeType: 'application/pdf',
  size: 512000,
  presignedUrl: PRESIGNED_URL,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const mockPaginatedResult: PaginatedResult<DocumentResponseDto> = {
  items: [mockDocumentResponse],
  meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
};

const mockRes = { header: jest.fn() } as unknown as Response;

const makeMulterFile = (): Express.Multer.File =>
  ({
    fieldname: 'file',
    originalname: 'resume.pdf',
    encoding: '7bit',
    mimetype: 'application/pdf',
    buffer: Buffer.from('pdf'),
    size: 512000,
  }) as Express.Multer.File;

describe('DocumentsController', () => {
  let controller: DocumentsController;
  let service: jest.Mocked<DocumentsService>;

  beforeEach(async () => {
    service = {
      upload: jest.fn(),
      findAll: jest.fn(),
      findByUuid: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<DocumentsService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DocumentsController],
      providers: [
        { provide: DocumentsService, useValue: service },
        { provide: JwtAuthGuard, useValue: { canActivate: () => true } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<DocumentsController>(DocumentsController);
  });

  afterEach(() => jest.clearAllMocks());

  // -----------------------------------------------------------------------
  // POST /documents
  // -----------------------------------------------------------------------
  describe('upload()', () => {
    it('should call service.upload and return DocumentResponseDto', async () => {
      service.upload.mockResolvedValue(mockDocumentResponse);
      const file = makeMulterFile();

      const result = await controller.upload(mockUser, file);

      expect(service.upload).toHaveBeenCalledWith(USER_UUID, file);
      expect(result).toEqual(mockDocumentResponse);
    });

    it('should propagate BadRequestException for invalid MIME type', async () => {
      service.upload.mockRejectedValue(
        new BadRequestException('Invalid file type'),
      );

      await expect(
        controller.upload(mockUser, makeMulterFile()),
      ).rejects.toThrow(BadRequestException);
    });

    it('should propagate BadRequestException for file too large', async () => {
      service.upload.mockRejectedValue(
        new BadRequestException('File size exceeds'),
      );

      await expect(
        controller.upload(mockUser, makeMulterFile()),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // -----------------------------------------------------------------------
  // GET /documents
  // -----------------------------------------------------------------------
  describe('getAll()', () => {
    it('should return paginated document list', async () => {
      service.findAll.mockResolvedValue(mockPaginatedResult);

      const result = await controller.getAll({ page: 1, limit: 10 });

      expect(service.findAll).toHaveBeenCalledWith({ page: 1, limit: 10 });
      expect(result).toEqual(mockPaginatedResult);
    });
  });

  // -----------------------------------------------------------------------
  // GET /documents/:uuid
  // -----------------------------------------------------------------------
  describe('getById()', () => {
    it('should set X-Data-Source header from cache and return response', async () => {
      service.findByUuid.mockResolvedValue({
        data: mockDocumentResponse,
        source: 'cache',
      });

      const result = await controller.getById(DOC_UUID, mockRes);

      expect(mockRes.header).toHaveBeenCalledWith('X-Data-Source', 'cache');
      expect(result).toEqual(mockDocumentResponse);
    });

    it('should set X-Data-Source header from database', async () => {
      service.findByUuid.mockResolvedValue({
        data: mockDocumentResponse,
        source: 'database',
      });

      await controller.getById(DOC_UUID, mockRes);

      expect(mockRes.header).toHaveBeenCalledWith('X-Data-Source', 'database');
    });

    it('should propagate NotFoundException', async () => {
      service.findByUuid.mockRejectedValue(new NotFoundException('Not found'));

      await expect(controller.getById(DOC_UUID, mockRes)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -----------------------------------------------------------------------
  // DELETE /documents/:uuid
  // -----------------------------------------------------------------------
  describe('remove()', () => {
    it('should call service.remove and return success message', async () => {
      service.remove.mockResolvedValue(undefined);

      const result = await controller.remove(DOC_UUID, mockUser);

      expect(service.remove).toHaveBeenCalledWith(DOC_UUID, USER_UUID);
      expect(result).toEqual({
        status: 'success',
        message: 'Document deleted successfully',
      });
    });

    it('should propagate ForbiddenException', async () => {
      service.remove.mockRejectedValue(new ForbiddenException('Forbidden'));

      await expect(controller.remove(DOC_UUID, mockUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should propagate NotFoundException', async () => {
      service.remove.mockRejectedValue(new NotFoundException('Not found'));

      await expect(controller.remove(DOC_UUID, mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
