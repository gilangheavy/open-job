import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { S3Service } from './s3.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Module({
  imports: [JwtModule.register({})],
  controllers: [DocumentsController],
  providers: [DocumentsService, S3Service, JwtAuthGuard],
  exports: [DocumentsService],
})
export class DocumentsModule {}
