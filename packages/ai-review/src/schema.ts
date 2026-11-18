import { z } from 'zod';
import {
  FindingCategorySchema,
  FindingConfidenceSchema,
  FindingSeveritySchema,
} from '@prguardian/shared';

export const AiCandidateFindingSchema = z.object({
  category: FindingCategorySchema,
  severity: FindingSeveritySchema,
  confidence: FindingConfidenceSchema.default('medium'),
  filePath: z.string().min(1),
  lineStart: z.number().int().positive(),
  lineEnd: z.number().int().positive().optional(),
  message: z.string().min(1),
  evidence: z.string().optional(),
  recommendation: z.string().optional(),
});

export const AiReviewResponseSchema = z.object({
  findings: z.array(AiCandidateFindingSchema).default([]),
});

export type ParsedAiReviewResponse = z.infer<typeof AiReviewResponseSchema>;
