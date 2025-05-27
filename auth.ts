import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import * as authSchema from './src/db/auth-schema';
import { drizzle } from 'drizzle-orm/d1';

// Mock DB for CLI purposes only (will be replaced at runtime)
const mockDb = {} as any;
// Create a drizzle instance with mock DB
const db = drizzle(mockDb, { schema: authSchema });

// This file is used by the Better Auth CLI for generating schema
// The actual auth implementation is in api/lib/auth.ts
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: {
      ...authSchema,
      user: authSchema.user,
      session: authSchema.session,
      account: authSchema.account,
      verification: authSchema.verification
    }
  }),
  emailAndPassword: {
    enabled: true
  }
});

export default auth; 