import { Global, Module } from '@nestjs/common';
import { QueueService } from './queue.service';
import { NotificationService } from './notification.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [QueueService, NotificationService],
  exports: [QueueService],
})
export class QueueModule {}
