import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z.string().min(1).default("postgresql://ontology:change-me@localhost:5433/ontology"),
  CORS_ORIGIN: z.string().min(1).default("http://localhost:5173"),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(200),
  RATE_LIMIT_WINDOW: z.string().default("1 minute"),
  BODY_LIMIT_BYTES: z.coerce.number().int().min(1024).default(1_048_576),
  BACKUP_DIR: z.string().default("backups")
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
