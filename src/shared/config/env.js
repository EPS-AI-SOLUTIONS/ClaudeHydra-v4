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
function validateEnv() {
  const raw = {
    VITE_BACKEND_URL: import.meta.env['VITE_BACKEND_URL'],
    VITE_AUTH_SECRET: import.meta.env['VITE_AUTH_SECRET'],
    VITE_PARTNER_AUTH_SECRET: import.meta.env['VITE_PARTNER_AUTH_SECRET'],
  };
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    console.warn(
      '[env] Invalid environment variables:',
      result.error.flatten().fieldErrors,
    );
    // Don't throw — allow dev mode with defaults
    return raw;
  }
  return result.data;
}
export const env = validateEnv();
