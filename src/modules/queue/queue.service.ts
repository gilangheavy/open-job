import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqplib from 'amqplib';
import type { EnvConfig } from '../../config/env.config';

const EXCHANGE_NAME = 'openjob.events';
const EXCHANGE_TYPE = 'direct';

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private connection: amqplib.ChannelModel | null = null;
  private channel: amqplib.Channel | null = null;

  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  async onModuleInit(): Promise<void> {
    try {
      const host: string = this.config.get('RABBITMQ_HOST');
      const port: number = this.config.get('RABBITMQ_PORT');
      const user: string = this.config.get('RABBITMQ_USER');
      const password: string = this.config.get('RABBITMQ_PASSWORD');

      this.connection = await amqplib.connect(
        `amqp://${user}:${password}@${host}:${port}`,
      );
      this.channel = await this.connection.createChannel();

      await this.channel.assertExchange(EXCHANGE_NAME, EXCHANGE_TYPE, {
        durable: true,
      });

      this.logger.log('RabbitMQ connection established');
    } catch (err) {
      this.logger.error(
        `Failed to connect to RabbitMQ: ${(err as Error).message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.channel?.close();
      await this.connection?.close();
      this.logger.log('RabbitMQ connection closed');
    } catch (err) {
      this.logger.error(
        `Error closing RabbitMQ connection: ${(err as Error).message}`,
      );
    }
  }

  publish(routingKey: string, payload: Record<string, unknown>): void {
    if (!this.channel) {
      this.logger.warn(
        `RabbitMQ channel not available. Skipping publish for key: ${routingKey}`,
      );
      return;
    }

    try {
      const content = Buffer.from(JSON.stringify(payload));
      this.channel.publish(EXCHANGE_NAME, routingKey, content, {
        persistent: true,
        contentType: 'application/json',
      });
      this.logger.log(`Published event [${routingKey}]`);
    } catch (err) {
      this.logger.error(
        `Failed to publish event [${routingKey}]: ${(err as Error).message}`,
      );
    }
  }
}
