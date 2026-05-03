import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Module({
  imports: [JwtModule.register({})],
  controllers: [ApplicationsController],
  providers: [ApplicationsService, JwtAuthGuard],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
