import { z } from 'zod';

export const authSignupSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(8)
    .regex(/[A-Za-z]/, 'must include at least one letter')
    .regex(/[0-9]/, 'must include at least one number'),
});

export const authLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const authRefreshSchema = z.object({
  refreshToken: z.string().min(20),
});

export const authLogoutSchema = authRefreshSchema;

export type AuthSignupInput = z.infer<typeof authSignupSchema>;
export type AuthLoginInput = z.infer<typeof authLoginSchema>;
export type AuthRefreshInput = z.infer<typeof authRefreshSchema>;

export type AuthResponse = {
  account_id: string;
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number;
};
