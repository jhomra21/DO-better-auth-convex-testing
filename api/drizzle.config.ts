import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './api/drizzle',
  schema: './api/db/notes-schema.ts',
  dialect: 'sqlite',
  driver: 'durable-sqlite',
}); 