-- CreateEnum
CREATE TYPE "ReviewMode" AS ENUM ('demo', 'live');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'partial');

-- CreateEnum
CREATE TYPE "FindingSource" AS ENUM ('demo_fixture', 'static_rule', 'llm');

-- CreateEnum
CREATE TYPE "FindingCategory" AS ENUM ('security', 'bug', 'error_handling', 'performance', 'test_coverage', 'style');

-- CreateEnum
CREATE TYPE "FindingSeverity" AS ENUM ('critical', 'high', 'medium', 'low', 'info');

-- CreateEnum
CREATE TYPE "FindingConfidence" AS ENUM ('high', 'medium', 'low');

-- CreateEnum
CREATE TYPE "FindingValidationStatus" AS ENUM ('valid', 'invalid_location', 'low_confidence', 'rejected');

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "mode" "ReviewMode" NOT NULL DEFAULT 'live',
    "status" "ReviewStatus" NOT NULL DEFAULT 'queued',
    "repository_id" TEXT,
    "github_repository_id" BIGINT NOT NULL,
    "owner" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pr_number" INTEGER NOT NULL,
    "pr_title" TEXT NOT NULL,
    "pr_url" TEXT,
    "head_sha" TEXT NOT NULL,
    "job_id" TEXT,
    "findings_total" INTEGER NOT NULL DEFAULT 0,
    "findings_critical" INTEGER NOT NULL DEFAULT 0,
    "findings_high" INTEGER NOT NULL DEFAULT 0,
    "findings_medium" INTEGER NOT NULL DEFAULT 0,
    "findings_low" INTEGER NOT NULL DEFAULT 0,
    "findings_info" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "findings" (
    "id" TEXT NOT NULL,
    "review_id" TEXT NOT NULL,
    "source" "FindingSource" NOT NULL,
    "category" "FindingCategory" NOT NULL,
    "severity" "FindingSeverity" NOT NULL,
    "confidence" "FindingConfidence" NOT NULL,
    "file_path" TEXT NOT NULL,
    "line_start" INTEGER NOT NULL,
    "line_end" INTEGER,
    "message" TEXT NOT NULL,
    "evidence" TEXT,
    "recommendation" TEXT,
    "validation_status" "FindingValidationStatus" NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "findings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reviews_repository_id_created_at_idx" ON "reviews"("repository_id", "created_at");

-- CreateIndex
CREATE INDEX "reviews_job_id_idx" ON "reviews"("job_id");

-- CreateIndex
CREATE INDEX "reviews_github_repository_id_pr_number_head_sha_idx" ON "reviews"("github_repository_id", "pr_number", "head_sha");

-- CreateIndex
CREATE INDEX "findings_review_id_idx" ON "findings"("review_id");

-- CreateIndex
CREATE INDEX "findings_fingerprint_idx" ON "findings"("fingerprint");

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "repositories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "review_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
