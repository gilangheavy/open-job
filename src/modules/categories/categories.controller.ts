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

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  getAll(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<CategoryResponseDto>> {
    return this.categoriesService.findAll(query);
  }

  @Get(':uuid')
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
  create(@Body() dto: CreateCategoryDto): Promise<CategoryResponseDto> {
    return this.categoriesService.create(dto);
  }

  @Put(':uuid')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @SkipTransform()
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
  async remove(
    @Param('uuid') uuid: string,
  ): Promise<{ status: string; message: string }> {
    await this.categoriesService.remove(uuid);
    return { status: 'success', message: 'Category deleted successfully' };
  }
}
