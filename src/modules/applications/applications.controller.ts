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

@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateApplicationDto,
  ): Promise<ApplicationResponseDto> {
    return this.applicationsService.create(user.id, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  getAll(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<ApplicationResponseDto>> {
    return this.applicationsService.findAll(query);
  }

  @Get('user/:userId')
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
  @SkipTransform()
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
  @UseGuards(JwtAuthGuard)
  @SkipTransform()
  async remove(
    @Param('uuid') uuid: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ status: string; message: string }> {
    await this.applicationsService.remove(uuid, user.id);
    return { status: 'success', message: 'Application deleted successfully' };
  }
}
