import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Document, User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from './s3.service';
import { CacheService } from '../cache/cache.service';
import { DocumentResponseDto } from './dto/document-response.dto';
import type {
  PaginatedResult,
  PaginationQueryDto,
} from '../profile/dto/pagination-query.dto';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME = 'application/pdf';
const CACHE_TTL = 3600;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const cacheKey = (uuid: string) => `documents:${uuid}`;

type DocumentWithUser = Document & { user: User };

export type FindByUuidResult = {
  data: DocumentResponseDto;
  source: 'cache' | 'database';
};

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly cache: CacheService,
  ) {}

  async upload(
    userUuid: string,
    file: Express.Multer.File,
  ): Promise<DocumentResponseDto> {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    if (file.mimetype !== ALLOWED_MIME) {
      throw new BadRequestException(
        'Invalid file type. Only application/pdf is allowed',
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(
        'File size exceeds the maximum allowed limit of 5MB',
      );
    }

    const user = await this.prisma.client.user.findUnique({
      where: { uuid: userUuid },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const timestamp = Date.now();
    const sanitized = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const key = `documents/${userUuid}/${timestamp}-${sanitized}`;

    await this.s3.uploadFile(file.buffer, key, file.mimetype);

    const doc = await this.prisma.client.document.create({
      data: {
        user: { connect: { id: user.id } },
        filename: key,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        url: key,
      },
      include: { user: true },
    });

    const presignedUrl = await this.s3.getPresignedUrl(key);
    return this.toResponse(doc, presignedUrl);
  }

  async findAll(
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<DocumentResponseDto>> {
    const { page, limit } = query;
    const skip = (page - 1) * limit;

    const [total, docs] = await Promise.all([
      this.prisma.client.document.count(),
      this.prisma.client.document.findMany({
        skip,
        take: limit,
        include: { user: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const items = await Promise.all(
      (docs as DocumentWithUser[]).map(async (doc) => {
        const presignedUrl = await this.s3.getPresignedUrl(doc.url);
        return this.toResponse(doc, presignedUrl);
      }),
    );

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findByUuid(uuid: string): Promise<FindByUuidResult> {
    if (!UUID_REGEX.test(uuid)) {
      throw new NotFoundException('Document not found');
    }

    const cached = await this.cache.get<DocumentResponseDto>(cacheKey(uuid));
    if (cached) {
      return { data: cached, source: 'cache' };
    }

    const doc = await this.prisma.client.document.findUnique({
      where: { uuid },
      include: { user: true },
    });

    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    const presignedUrl = await this.s3.getPresignedUrl(doc.url);
    const response = this.toResponse(doc, presignedUrl);

    await this.cache.set(cacheKey(uuid), response, CACHE_TTL);
    return { data: response, source: 'database' };
  }

  async remove(uuid: string, requesterUuid: string): Promise<void> {
    if (!UUID_REGEX.test(uuid)) {
      throw new NotFoundException('Document not found');
    }

    const doc = await this.prisma.client.document.findUnique({
      where: { uuid },
      include: { user: true },
    });

    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    if (doc.user.uuid !== requesterUuid) {
      throw new ForbiddenException(
        'You are not authorized to delete this document',
      );
    }

    await this.s3.deleteFile(doc.url);
    await this.prisma.client.document.delete({ where: { uuid } });
    await this.cache.del(cacheKey(uuid));
  }

  private toResponse(
    doc: DocumentWithUser,
    presignedUrl: string,
  ): DocumentResponseDto {
    return {
      id: doc.uuid,
      userId: doc.user.uuid,
      originalName: doc.originalName,
      mimeType: doc.mimeType,
      size: doc.size,
      presignedUrl,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
