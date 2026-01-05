import { z } from 'zod';

export const pixKeyTypeSchema = z.enum(['cpf', 'phone', 'email', 'random']);

export const identidadeInputSchema = z.object({
  fullName: z.string().min(3),
  cpf: z.string().min(11),
  pixKey: z.string().min(3),
  pixKeyType: pixKeyTypeSchema,
});

export type IdentidadeInput = z.infer<typeof identidadeInputSchema>;
