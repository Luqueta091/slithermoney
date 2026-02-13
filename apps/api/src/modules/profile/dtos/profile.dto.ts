import { z } from 'zod';

export const updateProfileInputSchema = z.object({
  displayName: z.string().trim().min(2).max(32),
});

export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>;

export type ProfileResponse = {
  account_id: string;
  email: string | null;
  display_name: string | null;
  created_at: Date;
  updated_at: Date;
};
