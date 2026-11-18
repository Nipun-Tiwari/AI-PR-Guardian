import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { getClient } from '@prguardian/database';
import type { ApiProblemV1 } from '@prguardian/shared';
import { requireAuth, type RequestWithSession } from '../../middleware/requireAuth.js';
import type { RequestWithId } from '../../middleware/requestId.js';
import { AccessDeniedError } from '../../middleware/errorHandler.js';
import { toReviewSummary } from '../../lib/reviewMappers.js';

export const repositoriesRouter = Router();

repositoriesRouter.use(requireAuth);

function problemNotFound(req: Request, id: string): ApiProblemV1 {
  return {
    type: 'https://prguardian.dev/problems/resource-not-found',
    title: 'Repository not found',
    status: 404,
    detail: `No repository with id "${id}" exists.`,
    code: 'RESOURCE_NOT_FOUND',
    requestId: (req as RequestWithId).id ?? 'unknown',
    retryable: false,
  };
}

/** GET /api/v1/repositories — List repositories for the authenticated user */
repositoriesRouter.get(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { user } = req as RequestWithSession;
    try {
      const repos = await getClient().repository.findMany({
        where: { ownedByUserId: user.id, isActive: true },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          githubRepositoryId: true,
          githubInstallationId: true,
          owner: true,
          name: true,
          fullName: true,
          isActive: true,
          createdAt: true,
        },
      });

      res.status(200).json({
        repositories: repos.map(
          (r: {
            id: string;
            githubRepositoryId: bigint;
            githubInstallationId: bigint;
            owner: string;
            name: string;
            fullName: string;
            isActive: boolean;
            createdAt: Date;
          }) => ({
            ...r,
            githubRepositoryId: r.githubRepositoryId.toString(),
            githubInstallationId: r.githubInstallationId.toString(),
          }),
        ),
        total: repos.length,
      });
    } catch (err) {
      next(err);
    }
  },
);

/** GET /api/v1/repositories/:id/reviews — List reviews for a repository owned by the user */
repositoriesRouter.get(
  '/:id/reviews',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { user } = req as RequestWithSession;
    const rawId = req.params['id'];
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id) {
      res
        .status(400)
        .contentType('application/problem+json')
        .json({
          type: 'https://prguardian.dev/problems/validation-error',
          title: 'Invalid path parameter',
          status: 400,
          detail: 'Repository id is required',
          code: 'VALIDATION_ERROR',
          requestId: (req as RequestWithId).id ?? 'unknown',
          retryable: false,
        } satisfies ApiProblemV1);
      return;
    }

    try {
      const repo = await getClient().repository.findUnique({ where: { id } });
      if (!repo) {
        res.status(404).contentType('application/problem+json').json(problemNotFound(req, id));
        return;
      }
      if (repo.ownedByUserId !== user.id) {
        throw new AccessDeniedError('You do not have access to this repository.');
      }

      const reviews = await getClient().review.findMany({
        where: { repositoryId: id },
        orderBy: { createdAt: 'desc' },
      });

      res.status(200).json({
        repositoryId: id,
        reviews: reviews.map(toReviewSummary),
        total: reviews.length,
      });
    } catch (err) {
      next(err);
    }
  },
);
