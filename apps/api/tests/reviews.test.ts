import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { getClient } from '@prguardian/database';
import { createApp } from '../src/server.js';
import { createAuthenticatedSession, cleanupTestUser } from './helpers/session.js';

const app = createApp();
const db = getClient();

async function seedOwnedReview(userId: string) {
  const repo = await db.repository.create({
    data: {
      githubRepositoryId: BigInt(Date.now()),
      githubInstallationId: BigInt(999),
      owner: 'acme',
      name: 'api',
      fullName: 'acme/api',
      isActive: true,
      ownedByUserId: userId,
    },
  });

  const review = await db.review.create({
    data: {
      mode: 'live',
      status: 'succeeded',
      repositoryId: repo.id,
      githubRepositoryId: repo.githubRepositoryId,
      owner: 'acme',
      name: 'api',
      prNumber: 42,
      prTitle: 'Fix eval',
      prUrl: 'https://github.com/acme/api/pull/42',
      headSha: 'abcdef1',
      findingsTotal: 1,
      findingsHigh: 1,
      startedAt: new Date(),
      completedAt: new Date(),
    },
  });

  await db.finding.create({
    data: {
      reviewId: review.id,
      source: 'static_rule',
      category: 'security',
      severity: 'high',
      confidence: 'high',
      filePath: 'src/unsafe.js',
      lineStart: 2,
      message: '[eslint:no-eval] Unexpected use of eval()',
      validationStatus: 'valid',
      fingerprint: 'deadbeefdeadbeef',
    },
  });

  return { repo, review };
}

afterEach(async () => {
  await db.finding.deleteMany({});
  await db.review.deleteMany({});
  await db.repository.deleteMany({});
});

describe('live review APIs', () => {
  it('GET /api/v1/reviews/:id requires auth', async () => {
    const res = await request(app).get('/api/v1/reviews/does-not-exist');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('returns review summary and findings for the owning user', async () => {
    const { cookie, userId } = await createAuthenticatedSession();
    const { repo, review } = await seedOwnedReview(userId);

    const list = await request(app)
      .get(`/api/v1/repositories/${repo.id}/reviews`)
      .set('Cookie', cookie);
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(1);
    expect(list.body.reviews[0].id).toBe(review.id);
    expect(list.body.reviews[0].mode).toBe('live');

    const one = await request(app).get(`/api/v1/reviews/${review.id}`).set('Cookie', cookie);
    expect(one.status).toBe(200);
    expect(one.body.pullRequest.number).toBe(42);
    expect(one.body.findingsSummary.high).toBe(1);

    const findings = await request(app)
      .get(`/api/v1/reviews/${review.id}/findings`)
      .set('Cookie', cookie);
    expect(findings.status).toBe(200);
    expect(findings.body.total).toBe(1);
    expect(findings.body.findings[0].source).toBe('static_rule');
    expect(findings.body.findings[0].fingerprint).toBe('deadbeefdeadbeef');

    await cleanupTestUser(userId);
  });

  it('denies access to another users review', async () => {
    const owner = await createAuthenticatedSession({
      githubUserId: BigInt(101),
      githubUsername: 'owner',
    });
    const other = await createAuthenticatedSession({
      githubUserId: BigInt(202),
      githubUsername: 'other',
    });
    const { review } = await seedOwnedReview(owner.userId);

    const res = await request(app).get(`/api/v1/reviews/${review.id}`).set('Cookie', other.cookie);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCESS_DENIED');

    await cleanupTestUser(owner.userId);
    await cleanupTestUser(other.userId);
  });
});
