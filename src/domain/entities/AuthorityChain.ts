import { z } from 'zod';

export const AuthorityChainSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  objectId: z.string().min(1),
  previousHash: z.string().optional().nullable(),
  supersededBy: z.string().optional().nullable(),
  changeReason: z.string().trim().min(1),
  changedAt: z.number().int().nonnegative(),
  changedBy: z.string().optional().nullable()
});

export type AuthorityChain = z.infer<typeof AuthorityChainSchema>;

export const AuthorityChainInputSchema = z.object({
  objectId: z.string().min(1),
  previousHash: z.string().optional(),
  changeReason: z.string().trim().min(1),
  changedBy: z.string().optional()
});

export type AuthorityChainInput = z.infer<typeof AuthorityChainInputSchema>;