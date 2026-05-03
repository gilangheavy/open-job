import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqplib from 'amqplib';
import * as nodemailer from 'nodemailer';
import type { Application, Company, Job, User } from '@prisma/client';
import type { EnvConfig } from '../../config/env.config';
import { PrismaService } from '../../prisma/prisma.service';

const EXCHANGE_NAME = 'openjob.events';
const QUEUE_NAME = 'application.created';
const MAX_RETRIES = 3;

type CompanyWithOwner = Company & { owner: User };
type JobWithCompany = Job & { company: CompanyWithOwner };
type ApplicationWithRelations = Application & {
  user: User;
  job: JobWithCompany;
};

@Injectable()
export class NotificationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationService.name);
  private connection: amqplib.ChannelModel | null = null;
  private channel: amqplib.Channel | null = null;
  private transporter: nodemailer.Transporter | null = null;

  constructor(
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.transporter = nodemailer.createTransport({
      host: this.config.get('MAIL_HOST'),
      port: this.config.get('MAIL_PORT'),
      auth: {
        user: this.config.get('MAIL_USER'),
        pass: this.config.get('MAIL_PASSWORD'),
      },
    });

    try {
      const host = this.config.get('RABBITMQ_HOST');
      const port = this.config.get('RABBITMQ_PORT');
      const user = this.config.get('RABBITMQ_USER');
      const password = this.config.get('RABBITMQ_PASSWORD');

      this.connection = await amqplib.connect(
        `amqp://${user}:${password}@${host}:${port}`,
      );
      this.channel = await this.connection.createChannel();

      // Process one message at a time
      await this.channel.prefetch(1);

      await this.channel.consume(QUEUE_NAME, (msg) => {
        if (msg) {
          void this.processMessage(msg);
        }
      });

      this.logger.log('NotificationService consumer started');
    } catch (err) {
      this.logger.error(
        `NotificationService failed to start: ${(err as Error).message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.channel?.close();
      await this.connection?.close();
      this.logger.log('NotificationService consumer stopped');
    } catch (err) {
      this.logger.error(
        `Error stopping NotificationService: ${(err as Error).message}`,
      );
    }
  }

  async processMessage(msg: amqplib.Message): Promise<void> {
    // --- Parse payload ---
    let payload: { applicationId: string };
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const parsed = JSON.parse(msg.content.toString());
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        typeof (parsed as Record<string, unknown>).applicationId !== 'string' ||
        !(parsed as Record<string, unknown>).applicationId
      ) {
        throw new Error('Malformed payload: missing applicationId');
      }
      payload = parsed as { applicationId: string };
    } catch (err) {
      this.logger.error(
        `Dead-lettering malformed message: ${(err as Error).message}`,
      );
      this.channel?.nack(msg, false, false);
      return;
    }

    const retryCount = Number(
      (msg.properties.headers?.['x-retry-count'] as number | undefined) ?? 0,
    );

    try {
      const application = await this.prisma.client.application.findUnique({
        where: { uuid: payload.applicationId },
        include: {
          user: true,
          job: { include: { company: { include: { owner: true } } } },
        },
      });

      if (!application) {
        throw new Error(
          `Application not found: ${payload.applicationId}`,
        );
      }

      await this.sendNotificationEmail(
        application as unknown as ApplicationWithRelations,
      );

      this.channel?.ack(msg);
      this.logger.log(
        `Notification sent for application ${payload.applicationId}`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to process message (attempt ${retryCount + 1}): ${(err as Error).message}`,
      );

      if (retryCount < MAX_RETRIES) {
        // Exponential backoff: 1s, 2s, 4s (2^retryCount * 1000ms)
        const delay = Math.pow(2, retryCount) * 1000;
        this.channel?.ack(msg);

        await this.delay(delay);

        const content = Buffer.from(JSON.stringify(payload));
        this.channel?.publish(EXCHANGE_NAME, QUEUE_NAME, content, {
          persistent: true,
          contentType: 'application/json',
          headers: { 'x-retry-count': retryCount + 1 },
        });

        this.logger.log(
          `Scheduled retry ${retryCount + 1}/${MAX_RETRIES} for application ${payload.applicationId}`,
        );
      } else {
        // Exhausted retries — dead-letter the message
        this.channel?.nack(msg, false, false);
        this.logger.warn(
          `Max retries exceeded for application ${payload.applicationId}. Sending to DLQ.`,
        );
      }
    }
  }

  async sendNotificationEmail(
    application: ApplicationWithRelations,
  ): Promise<void> {
    const { user: applicant, job, createdAt } = application;
    const ownerEmail = job.company.owner.email;
    const applicationDate = createdAt.toISOString().split('T')[0];

    await this.transporter!.sendMail({
      from: this.config.get('MAIL_USER'),
      to: ownerEmail,
      subject: `New Application: ${job.title}`,
      html: `
        <h2>New Job Application Received</h2>
        <p>A new candidate has applied for the position <strong>${job.title}</strong>.</p>
        <table>
          <tr><td><strong>Applicant Name:</strong></td><td>${applicant.fullname}</td></tr>
          <tr><td><strong>Applicant Email:</strong></td><td>${applicant.email}</td></tr>
          <tr><td><strong>Application Date:</strong></td><td>${applicationDate}</td></tr>
        </table>
        <p>Log in to OpenJob to review and update the application status.</p>
      `,
    });
  }

  protected delay(ms: number): Promise<void> {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }
}
