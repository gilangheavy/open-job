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

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  getAll(
    @Query() query: JobQueryDto,
  ): Promise<PaginatedResult<JobResponseDto>> {
    return this.jobsService.findAll(query);
  }

  // NOTE: static-prefix routes must be declared before :uuid to avoid
  // NestJS / Express route-matching conflicts.
  @Get('company/:companyId')
  getByCompany(
    @Param('companyId') companyId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<JobResponseDto>> {
    return this.jobsService.findByCompany(companyId, query);
  }

  @Get('category/:categoryId')
  getByCategory(
    @Param('categoryId') categoryId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<JobResponseDto>> {
    return this.jobsService.findByCategory(categoryId, query);
  }

  @Get(':uuid')
  async getById(
    @Param('uuid') uuid: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<JobResponseDto> {
    const { data, source } = await this.jobsService.findByUuid(uuid);
    res.header('X-Data-Source', source);
    return data;
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
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
  async update(
    @Param('uuid') uuid: string,
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
  async remove(
    @Param('uuid') uuid: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ status: string; message: string }> {
    await this.jobsService.remove(uuid, user.id);
    return { status: 'success', message: 'Job deleted successfully' };
  }
}
