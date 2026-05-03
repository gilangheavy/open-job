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
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { CompanyResponseDto } from './dto/company-response.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import {
  PaginationQueryDto,
  type PaginatedResult,
} from '../profile/dto/pagination-query.dto';

@ApiTags('Companies')
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get()
  @ApiOperation({ summary: 'List all companies (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Paginated list of companies' })
  getAll(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<CompanyResponseDto>> {
    return this.companiesService.findAll(query);
  }

  @Get(':uuid')
  @ApiOperation({ summary: 'Get a company by UUID' })
  @ApiParam({ name: 'uuid', description: 'Company UUID' })
  @ApiHeader({ name: 'X-Data-Source', required: false, description: 'cache | database' })
  @ApiResponse({ status: 200, description: 'Company found', type: CompanyResponseDto })
  @ApiResponse({ status: 404, description: 'Company not found' })
  async getById(
    @Param('uuid') uuid: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CompanyResponseDto> {
    const { data, source } = await this.companiesService.findByUuid(uuid);
    res.header('X-Data-Source', source);
    return data;
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a new company' })
  @ApiResponse({ status: 201, description: 'Company created', type: CompanyResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateCompanyDto,
  ): Promise<CompanyResponseDto> {
    return this.companiesService.create(user.id, dto);
  }

  @Put(':uuid')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @SkipTransform()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update a company' })
  @ApiParam({ name: 'uuid', description: 'Company UUID' })
  @ApiResponse({ status: 200, description: 'Company updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden — not the owner' })
  @ApiResponse({ status: 404, description: 'Company not found' })
  async update(
    @Param('uuid') uuid: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateCompanyDto,
  ): Promise<{ status: string; message: string }> {
    await this.companiesService.update(uuid, user.id, dto);
    return { status: 'success', message: 'Company updated successfully' };
  }

  @Delete(':uuid')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @SkipTransform()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete (soft-delete) a company' })
  @ApiParam({ name: 'uuid', description: 'Company UUID' })
  @ApiResponse({ status: 200, description: 'Company deleted successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden — not the owner' })
  @ApiResponse({ status: 404, description: 'Company not found' })
  async remove(
    @Param('uuid') uuid: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ status: string; message: string }> {
    await this.companiesService.remove(uuid, user.id);
    return { status: 'success', message: 'Company deleted successfully' };
  }
}
