import { z } from 'zod';

export const authSignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(4),
});

export const authLoginSchema = authSignupSchema;

export type AuthSignupInput = z.infer<typeof authSignupSchema>;
export type AuthLoginInput = z.infer<typeof authLoginSchema>;
