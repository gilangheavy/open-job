import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(5000),
  HOST: z.string().default('localhost'),

  // Comma-separated list of allowed CORS origins, or '*' for any.
  // Default '*' is intentional for local-dev; production deployments
  // MUST set an explicit whitelist via the CORS_ORIGIN env var.
  CORS_ORIGIN: z.string().default('*'),

  DATABASE_URL: z.string().min(1),

  ACCESS_TOKEN_KEY: z.string().min(1),
  REFRESH_TOKEN_KEY: z.string().min(1),

  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().default(6379),

  RABBITMQ_HOST: z.string().min(1),
  RABBITMQ_PORT: z.coerce.number().default(5672),
  RABBITMQ_USER: z.string().min(1),
  RABBITMQ_PASSWORD: z.string().min(1),

  MAIL_HOST: z.string().min(1),
  MAIL_PORT: z.coerce.number(),
  MAIL_USER: z.string().min(1),
  MAIL_PASSWORD: z.string().min(1),

  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET_NAME: z.string().min(1),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validate(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Environment validation failed:\n${formatted}`);
  }

  return result.data;
}
