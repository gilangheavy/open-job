import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { BookmarksController } from './bookmarks.controller';
import { BookmarksService } from './bookmarks.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Module({
  imports: [JwtModule.register({})],
  controllers: [BookmarksController],
  providers: [BookmarksService, JwtAuthGuard],
  exports: [BookmarksService],
})
export class BookmarksModule {}
