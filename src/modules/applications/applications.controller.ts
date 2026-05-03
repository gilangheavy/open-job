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
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationStatusDto } from './dto/update-application-status.dto';
import { ApplicationResponseDto } from './dto/application-response.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import {
  PaginationQueryDto,
  type PaginatedResult,
} from '../profile/dto/pagination-query.dto';

@ApiTags('Applications')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit a job application' })
  @ApiResponse({
    status: 201,
    description: 'Application created',
    type: ApplicationResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 409, description: 'Already applied to this job' })
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateApplicationDto,
  ): Promise<ApplicationResponseDto> {
    return this.applicationsService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all applications (admin, paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Paginated list of applications' })
  getAll(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<ApplicationResponseDto>> {
    return this.applicationsService.findAll(query);
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'List applications by user UUID' })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiHeader({
    name: 'X-Data-Source',
    required: false,
    description: 'cache | database',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of applications for the user',
  })
  @ApiResponse({
    status: 403,
    description: "Forbidden — cannot view another user's applications",
  })
  async getByUser(
    @Param('userId') userId: string,
    @CurrentUser() user: JwtPayload,
    @Query() query: PaginationQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaginatedResult<ApplicationResponseDto>> {
    const { data, source } = await this.applicationsService.findByUser(
      userId,
      user.id,
      query,
    );
    res.header('X-Data-Source', source);
    return data;
  }

  @Get('job/:jobId')
  @ApiOperation({ summary: 'List applications for a job (company owner only)' })
  @ApiParam({ name: 'jobId', description: 'Job UUID' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiHeader({
    name: 'X-Data-Source',
    required: false,
    description: 'cache | database',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of applications for the job',
  })
  @ApiResponse({ status: 403, description: 'Forbidden — not the job owner' })
  async getByJob(
    @Param('jobId') jobId: string,
    @CurrentUser() user: JwtPayload,
    @Query() query: PaginationQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaginatedResult<ApplicationResponseDto>> {
    const { data, source } = await this.applicationsService.findByJob(
      jobId,
      user.id,
      query,
    );
    res.header('X-Data-Source', source);
    return data;
  }

  @Get(':uuid')
  @ApiOperation({ summary: 'Get a single application by UUID' })
  @ApiParam({ name: 'uuid', description: 'Application UUID' })
  @ApiHeader({
    name: 'X-Data-Source',
    required: false,
    description: 'cache | database',
  })
  @ApiResponse({
    status: 200,
    description: 'Application found',
    type: ApplicationResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Application not found' })
  async getById(
    @Param('uuid') uuid: string,
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ApplicationResponseDto> {
    const { data, source } = await this.applicationsService.findByUuid(
      uuid,
      user.id,
    );
    res.header('X-Data-Source', source);
    return data;
  }

  @Put(':uuid')
  @HttpCode(HttpStatus.OK)
  @SkipTransform()
  @ApiOperation({ summary: 'Update application status (company owner only)' })
  @ApiParam({ name: 'uuid', description: 'Application UUID' })
  @ApiResponse({
    status: 200,
    description: 'Application status updated successfully',
  })
  @ApiResponse({ status: 403, description: 'Forbidden — not the job owner' })
  @ApiResponse({ status: 404, description: 'Application not found' })
  async updateStatus(
    @Param('uuid') uuid: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateApplicationStatusDto,
  ): Promise<{ status: string; message: string }> {
    await this.applicationsService.updateStatus(uuid, user.id, dto);
    return {
      status: 'success',
      message: 'Application status updated successfully',
    };
  }

  @Delete(':uuid')
  @HttpCode(HttpStatus.OK)
  @SkipTransform()
  @ApiOperation({ summary: 'Withdraw (soft-delete) a job application' })
  @ApiParam({ name: 'uuid', description: 'Application UUID' })
  @ApiResponse({ status: 200, description: 'Application deleted successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden — not the applicant' })
  @ApiResponse({ status: 404, description: 'Application not found' })
  async remove(
    @Param('uuid') uuid: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ status: string; message: string }> {
    await this.applicationsService.remove(uuid, user.id);
    return { status: 'success', message: 'Application deleted successfully' };
  }
}
