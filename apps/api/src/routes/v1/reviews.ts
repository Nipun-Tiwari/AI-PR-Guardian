import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { getClient } from '@prguardian/database';
import {
  FindingCategorySchema,
  FindingSeveritySchema,
  type ApiProblemV1,
} from '@prguardian/shared';
import { requireAuth, type RequestWithSession } from '../../middleware/requireAuth.js';
import type { RequestWithId } from '../../middleware/requestId.js';
import { AccessDeniedError } from '../../middleware/errorHandler.js';
import { toFindingV1, toReviewSummary } from '../../lib/reviewMappers.js';

export const reviewsRouter = Router();

reviewsRouter.use(requireAuth);

function problemNotFound(req: Request, id: string): ApiProblemV1 {
  return {
    type: 'https://prguardian.dev/problems/resource-not-found',
    title: 'Review not found',
    status: 404,
    detail: `No review with id "${id}" exists.`,
    code: 'RESOURCE_NOT_FOUND',
    requestId: (req as RequestWithId).id ?? 'unknown',
    retryable: false,
  };
}

function problemValidation(req: Request, paramPath: string, message: string): ApiProblemV1 {
  return {
    type: 'https://prguardian.dev/problems/validation-error',
    title: 'Invalid query parameter',
    status: 400,
    detail: message,
    code: 'VALIDATION_ERROR',
    requestId: (req as RequestWithId).id ?? 'unknown',
    retryable: false,
    errors: [{ path: paramPath, message }],
  };
}

async function assertReviewAccess(userId: string, reviewId: string) {
  const db = getClient();
  const review = await db.review.findUnique({
    where: { id: reviewId },
    include: { repository: true },
  });

  if (!review) {
    return null;
  }

  if (!review.repository || review.repository.ownedByUserId !== userId) {
    throw new AccessDeniedError('You do not have access to this review.');
  }

  return review;
}

/** GET /api/v1/reviews/:id */
reviewsRouter.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { user } = req as RequestWithSession;
    const rawId = req.params['id'];
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id) {
      res
        .status(400)
        .contentType('application/problem+json')
        .json(problemValidation(req, 'id', 'Review id is required'));
      return;
    }

    try {
      const review = await assertReviewAccess(user.id, id);
      if (!review) {
        res.status(404).contentType('application/problem+json').json(problemNotFound(req, id));
        return;
      }

      res.status(200).json(toReviewSummary(review));
    } catch (err) {
      next(err);
    }
  },
);

/** GET /api/v1/reviews/:id/findings */
reviewsRouter.get(
  '/:id/findings',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { user } = req as RequestWithSession;
    const rawId = req.params['id'];
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id) {
      res
        .status(400)
        .contentType('application/problem+json')
        .json(problemValidation(req, 'id', 'Review id is required'));
      return;
    }

    try {
      const review = await assertReviewAccess(user.id, id);
      if (!review) {
        res.status(404).contentType('application/problem+json').json(problemNotFound(req, id));
        return;
      }

      const where: {
        reviewId: string;
        severity?: { in: Array<ReturnType<typeof FindingSeveritySchema.parse>> };
        category?: { in: Array<ReturnType<typeof FindingCategorySchema.parse>> };
      } = { reviewId: id };

      const rawSeverity = req.query['severity'];
      if (rawSeverity !== undefined) {
        const severityValues: string[] = Array.isArray(rawSeverity)
          ? (rawSeverity as unknown[]).filter((v): v is string => typeof v === 'string')
          : typeof rawSeverity === 'string'
            ? [rawSeverity]
            : [];
        const parsed = severityValues.map((v) => FindingSeveritySchema.safeParse(v));
        const invalid = parsed.find((r) => !r.success);
        if (invalid) {
          res
            .status(400)
            .contentType('application/problem+json')
            .json(
              problemValidation(
                req,
                'severity',
                `Invalid severity value. Must be one of: ${FindingSeveritySchema.options.join(', ')}`,
              ),
            );
          return;
        }
        where.severity = {
          in: parsed.map((r) => (r.success ? r.data : 'info')),
        };
      }

      const rawCategory = req.query['category'];
      if (rawCategory !== undefined) {
        const categoryValues: string[] = Array.isArray(rawCategory)
          ? (rawCategory as unknown[]).filter((v): v is string => typeof v === 'string')
          : typeof rawCategory === 'string'
            ? [rawCategory]
            : [];
        const parsed = categoryValues.map((v) => FindingCategorySchema.safeParse(v));
        const invalid = parsed.find((r) => !r.success);
        if (invalid) {
          res
            .status(400)
            .contentType('application/problem+json')
            .json(
              problemValidation(
                req,
                'category',
                `Invalid category value. Must be one of: ${FindingCategorySchema.options.join(', ')}`,
              ),
            );
          return;
        }
        where.category = {
          in: parsed.map((r) => (r.success ? r.data : 'style')),
        };
      }

      const findings = await getClient().finding.findMany({
        where,
        orderBy: [{ severity: 'asc' }, { createdAt: 'asc' }],
      });

      res.status(200).json({
        reviewId: id,
        findings: findings.map(toFindingV1),
        total: findings.length,
      });
    } catch (err) {
      next(err);
    }
  },
);
