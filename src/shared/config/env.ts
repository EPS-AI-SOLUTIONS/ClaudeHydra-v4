/** Jaskier Shared Pattern -- env validation */
// src/shared/config/env.ts
/**
 * ClaudeHydra v4 - Environment Variable Validation
 * ==================================================
 * Zod-based validation for all VITE_* env vars.
 * Warns on invalid values but does not throw — dev mode works with defaults.
 */

import { z } from 'zod';

const envSchema = z.object({
  VITE_BACKEND_URL: z.string().url().optional(),
  VITE_AUTH_SECRET: z.string().optional(),
  VITE_PARTNER_AUTH_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const raw = {
    // biome-ignore lint/complexity/useLiteralKeys: index signature requires bracket notation (TS4111)
    VITE_BACKEND_URL: import.meta.env['VITE_BACKEND_URL'] as string | undefined,
    // biome-ignore lint/complexity/useLiteralKeys: index signature requires bracket notation (TS4111)
    VITE_AUTH_SECRET: import.meta.env['VITE_AUTH_SECRET'] as string | undefined,
    // biome-ignore lint/complexity/useLiteralKeys: index signature requires bracket notation (TS4111)
    VITE_PARTNER_AUTH_SECRET: import.meta.env['VITE_PARTNER_AUTH_SECRET'] as string | undefined,
  };

  const result = envSchema.safeParse(raw);
  if (!result.success) {
    console.warn('[env] Invalid environment variables:', result.error.flatten().fieldErrors);
    // Don't throw — allow dev mode with defaults
    return raw as Env;
  }
  return result.data;
}

export const env = validateEnv();
