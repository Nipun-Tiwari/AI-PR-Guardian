import { z } from 'zod';

const boolFromEnv = (defaultValue: string) =>
  z
    .string()
    .transform((v) => v === 'true')
    .default(defaultValue);

const workerConfigSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
    WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(100).default(2000),
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).default(1),
    WORKER_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(3),
    WORKER_LEASE_SECONDS: z.coerce.number().int().min(10).default(120),
    WORKER_JOB_TIMEOUT_SECONDS: z.coerce.number().int().min(10).default(600),
    GITHUB_APP_ID: z.coerce.number().int().positive('GITHUB_APP_ID must be a positive integer'),
    GITHUB_APP_PRIVATE_KEY: z.string().min(1, 'GITHUB_APP_PRIVATE_KEY is required'),
    GITHUB_API_VERSION: z.string().min(1).default('2022-11-28'),
    STATIC_ANALYSIS_ENABLED: boolFromEnv('true'),
    AI_REVIEW_ENABLED: boolFromEnv('false'),
    COST_LIMIT_ENFORCED: boolFromEnv('true'),
    AI_PROVIDER: z.string().default('anthropic'),
    AI_MODEL_ID: z.string().default('claude-sonnet-4-6'),
    AI_API_KEY: z.string().optional(),
    AI_MAX_INPUT_TOKENS: z.coerce.number().int().min(1000).default(50_000),
    AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(256).default(4096),
    AI_MAX_COST_USD_PER_REVIEW: z.coerce.number().positive().default(0.05),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.AI_REVIEW_ENABLED && (!cfg.AI_API_KEY || cfg.AI_API_KEY.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AI_API_KEY'],
        message: 'AI_API_KEY is required when AI_REVIEW_ENABLED=true',
      });
    }
  });

const result = workerConfigSchema.safeParse(process.env);

if (!result.success) {
  const missing = result.error.errors.map((e) => `  ${e.path.join('.')}: ${e.message}`).join('\n');
  throw new Error(
    `Invalid worker configuration:\n${missing}\n\nCheck your .env file against .env.example`,
  );
}

export const workerConfig = result.data;
export type WorkerConfig = typeof workerConfig;
