import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiHeader,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { DocumentsService } from './documents.service';
import { DocumentResponseDto } from './dto/document-response.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import {
  PaginationQueryDto,
  type PaginatedResult,
} from '../profile/dto/pagination-query.dto';

@ApiTags('Documents')
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Upload a PDF resume/document (max 5MB)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary', description: 'PDF file (max 5MB)' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Document uploaded', type: DocumentResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid file type or size' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  upload(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<DocumentResponseDto> {
    return this.documentsService.upload(user.id, file);
  }

  @Get()
  @ApiOperation({ summary: 'List all documents (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Paginated list of documents' })
  getAll(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<DocumentResponseDto>> {
    return this.documentsService.findAll(query);
  }

  @Get(':uuid')
  @ApiOperation({ summary: 'Get a document by UUID' })
  @ApiParam({ name: 'uuid', description: 'Document UUID' })
  @ApiHeader({ name: 'X-Data-Source', required: false, description: 'cache | database' })
  @ApiResponse({ status: 200, description: 'Document found', type: DocumentResponseDto })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async getById(
    @Param('uuid') uuid: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DocumentResponseDto> {
    const { data, source } = await this.documentsService.findByUuid(uuid);
    res.header('X-Data-Source', source);
    return data;
  }

  @Delete(':uuid')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @SkipTransform()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete a document' })
  @ApiParam({ name: 'uuid', description: 'Document UUID' })
  @ApiResponse({ status: 200, description: 'Document deleted successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden — not the owner' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async remove(
    @Param('uuid') uuid: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ status: string; message: string }> {
    await this.documentsService.remove(uuid, user.id);
    return { status: 'success', message: 'Document deleted successfully' };
  }
}
