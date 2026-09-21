import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3333),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  ADMIN_NAME: z.string().min(1).default('Administrador'),
  ADMIN_EMAIL: z.string().email().default('admin@local.com'),
  ADMIN_PASSWORD: z.string().min(8),
  JWT_SECRET: z.string().min(32),
  COOKIE_SECURE: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
  SIRIUS_DEFAULT_URL: z.string().url().default('http://200.225.228.185:8540'),
  SIRIUS_TIMEOUT_MS: z.coerce.number().int().positive().max(120000).default(20000),
  QUEDA_PERCENTUAL: z.coerce.number().min(0).max(100).default(25),
  QUEDA_VOLUME_MINIMO: z.coerce.number().min(0).default(100),
});

const result = schema.safeParse(process.env);
if (!result.success) {
  console.error('Variáveis de ambiente inválidas:', result.error.flatten().fieldErrors);
  throw new Error('Configuração de ambiente inválida');
}
export const env = result.data;
