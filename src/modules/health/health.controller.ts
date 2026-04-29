import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { EnvConfig } from '../../config/env.config';
import { PrismaHealthIndicator } from './indicators/prisma.health';
import { TcpHealthIndicator } from './indicators/tcp.health';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';

@Controller('health')
@SkipTransform()
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: PrismaHealthIndicator,
    private readonly tcp: TcpHealthIndicator,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck('database'),
      () =>
        this.tcp.pingCheck(
          'redis',
          this.config.get('REDIS_HOST'),
          this.config.get('REDIS_PORT'),
        ),
      () =>
        this.tcp.pingCheck(
          'rabbitmq',
          this.config.get('RABBITMQ_HOST'),
          this.config.get('RABBITMQ_PORT'),
        ),
    ]);
  }
}
