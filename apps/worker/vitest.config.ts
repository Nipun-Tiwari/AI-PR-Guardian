import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    include: ['tests/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://prguardian:prguardian_test@localhost:5432/prguardian_test',
      LOG_LEVEL: 'error',
      WORKER_POLL_INTERVAL_MS: '100',
      WORKER_CONCURRENCY: '1',
      WORKER_MAX_ATTEMPTS: '3',
      WORKER_LEASE_SECONDS: '10',
      WORKER_JOB_TIMEOUT_SECONDS: '30',
      GITHUB_APP_ID: '12345',
      GITHUB_APP_PRIVATE_KEY: 'dGVzdF9kdW1teV9wcml2YXRlX2tleQ==',
      GITHUB_API_VERSION: '2022-11-28',
      STATIC_ANALYSIS_ENABLED: 'true',
      AI_REVIEW_ENABLED: 'false',
      COST_LIMIT_ENFORCED: 'true',
      AI_PROVIDER: 'anthropic',
      AI_MODEL_ID: 'claude-sonnet-4-6',
      AI_MAX_INPUT_TOKENS: '50000',
      AI_MAX_OUTPUT_TOKENS: '4096',
      AI_MAX_COST_USD_PER_REVIEW: '0.05',
    },
  },
});
