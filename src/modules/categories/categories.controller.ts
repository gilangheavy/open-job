import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiHeader,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CategoryResponseDto } from './dto/category-response.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import {
  PaginationQueryDto,
  type PaginatedResult,
} from '../profile/dto/pagination-query.dto';

@ApiTags('Categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'List all categories (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Paginated list of categories' })
  getAll(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<CategoryResponseDto>> {
    return this.categoriesService.findAll(query);
  }

  @Get(':uuid')
  @ApiOperation({ summary: 'Get a category by UUID' })
  @ApiParam({ name: 'uuid', description: 'Category UUID' })
  @ApiHeader({ name: 'X-Data-Source', required: false, description: 'cache | database' })
  @ApiResponse({ status: 200, description: 'Category found', type: CategoryResponseDto })
  @ApiResponse({ status: 404, description: 'Category not found' })
  async getById(
    @Param('uuid') uuid: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CategoryResponseDto> {
    const { data, source } = await this.categoriesService.findByUuid(uuid);
    res.header('X-Data-Source', source);
    return data;
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a new category (admin)' })
  @ApiResponse({ status: 201, description: 'Category created', type: CategoryResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  create(@Body() dto: CreateCategoryDto): Promise<CategoryResponseDto> {
    return this.categoriesService.create(dto);
  }

  @Put(':uuid')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @SkipTransform()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update a category' })
  @ApiParam({ name: 'uuid', description: 'Category UUID' })
  @ApiResponse({ status: 200, description: 'Category updated successfully' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  async update(
    @Param('uuid') uuid: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<{ status: string; message: string }> {
    await this.categoriesService.update(uuid, dto);
    return { status: 'success', message: 'Category updated successfully' };
  }

  @Delete(':uuid')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @SkipTransform()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete (soft-delete) a category' })
  @ApiParam({ name: 'uuid', description: 'Category UUID' })
  @ApiResponse({ status: 200, description: 'Category deleted successfully' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  async remove(
    @Param('uuid') uuid: string,
  ): Promise<{ status: string; message: string }> {
    await this.categoriesService.remove(uuid);
    return { status: 'success', message: 'Category deleted successfully' };
  }
}
