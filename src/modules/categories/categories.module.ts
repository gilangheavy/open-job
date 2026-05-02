import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Module({
  imports: [JwtModule.register({})],
  controllers: [CategoriesController],
  providers: [CategoriesService, JwtAuthGuard],
  exports: [CategoriesService],
})
export class CategoriesModule {}
