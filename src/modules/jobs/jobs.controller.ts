import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
import { JobsService } from './jobs.service';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { JobResponseDto } from './dto/job-response.dto';
import { JobQueryDto } from './dto/job-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import {
  PaginationQueryDto,
  type PaginatedResult,
} from '../profile/dto/pagination-query.dto';

@ApiTags('Jobs')
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  @ApiOperation({ summary: 'List all jobs (paginated, filterable)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'title',
    required: false,
    type: String,
    description: 'Filter by job title',
  })
  @ApiQuery({
    name: 'company-name',
    required: false,
    type: String,
    description: 'Filter by company name',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of jobs' })
  getAll(
    @Query() query: JobQueryDto,
  ): Promise<PaginatedResult<JobResponseDto>> {
    return this.jobsService.findAll(query);
  }

  // NOTE: static-prefix routes must be declared before :uuid to avoid
  // NestJS / Express route-matching conflicts.
  @Get('company/:companyId')
  @ApiOperation({ summary: 'List jobs by company UUID' })
  @ApiParam({ name: 'companyId', description: 'Company UUID' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of jobs for the given company',
  })
  getByCompany(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<JobResponseDto>> {
    return this.jobsService.findByCompany(companyId, query);
  }

  @Get('category/:categoryId')
  @ApiOperation({ summary: 'List jobs by category UUID' })
  @ApiParam({ name: 'categoryId', description: 'Category UUID' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of jobs for the given category',
  })
  getByCategory(
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<JobResponseDto>> {
    return this.jobsService.findByCategory(categoryId, query);
  }

  @Get(':uuid')
  @ApiOperation({ summary: 'Get a job by UUID' })
  @ApiParam({ name: 'uuid', description: 'Job UUID' })
  @ApiHeader({
    name: 'X-Data-Source',
    required: false,
    description: 'cache | database',
  })
  @ApiResponse({ status: 200, description: 'Job found', type: JobResponseDto })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async getById(
    @Param('uuid', ParseUUIDPipe) uuid: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<JobResponseDto> {
    const { data, source } = await this.jobsService.findByUuid(uuid);
    res.header('X-Data-Source', source);
    return data;
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a new job posting' })
  @ApiResponse({
    status: 201,
    description: 'Job created',
    type: JobResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — company not owned by user',
  })
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateJobDto,
  ): Promise<JobResponseDto> {
    return this.jobsService.create(user.id, dto);
  }

  @Put(':uuid')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @SkipTransform()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update a job posting' })
  @ApiParam({ name: 'uuid', description: 'Job UUID' })
  @ApiResponse({ status: 200, description: 'Job updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden — not the owner' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async update(
    @Param('uuid', ParseUUIDPipe) uuid: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateJobDto,
  ): Promise<{ status: string; message: string }> {
    await this.jobsService.update(uuid, user.id, dto);
    return { status: 'success', message: 'Job updated successfully' };
  }

  @Delete(':uuid')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @SkipTransform()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete (soft-delete) a job posting' })
  @ApiParam({ name: 'uuid', description: 'Job UUID' })
  @ApiResponse({ status: 200, description: 'Job deleted successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden — not the owner' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async remove(
    @Param('uuid', ParseUUIDPipe) uuid: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ status: string; message: string }> {
    await this.jobsService.remove(uuid, user.id);
    return { status: 'success', message: 'Job deleted successfully' };
  }
}
