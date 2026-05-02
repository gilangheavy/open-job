import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Module({
  imports: [
    // JwtModule with no default options; JwtAuthGuard supplies its own
    // secret per verify call — same pattern as ProfileModule.
    JwtModule.register({}),
  ],
  controllers: [CompaniesController],
  providers: [CompaniesService, JwtAuthGuard],
  exports: [CompaniesService],
})
export class CompaniesModule {}
