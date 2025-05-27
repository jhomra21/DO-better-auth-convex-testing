import { defineConfig } from '@better-auth/cli';
import * as authSchema from './src/db/auth-schema';

export default defineConfig({
  // SQLite provider for D1
  provider: "sqlite",
  
  // Schema with our existing tables
  schema: {
    user: "user",
    session: "session",
    account: "account",
    verification: "verification",
  },
  
  // Add our providers
  providers: {
    google: true,
    emailAndPassword: true
  }
}); 