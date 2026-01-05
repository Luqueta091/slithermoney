import { z } from 'zod';

export function loadEnv<T extends z.ZodTypeAny>(
  schema: T,
  defaults: Record<string, string | number | boolean | undefined> = {},
  env: NodeJS.ProcessEnv = process.env,
): z.infer<T> {
  const merged: Record<string, unknown> = {
    ...defaults,
    ...env,
  };

  return schema.parse(merged);
}
