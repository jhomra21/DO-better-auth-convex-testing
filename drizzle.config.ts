import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/auth-schema.ts',
  out: './drizzle/migrations',
  dialect: 'sqlite',
} satisfies Config; 