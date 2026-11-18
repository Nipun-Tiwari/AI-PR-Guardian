-- AlterTable: make owned_by_user_id nullable on repositories
ALTER TABLE "repositories" DROP CONSTRAINT "repositories_owned_by_user_id_fkey";
ALTER TABLE "repositories" ALTER COLUMN "owned_by_user_id" DROP NOT NULL;

-- AlterTable: make created_by_user_id nullable on repository_installations
ALTER TABLE "repository_installations" DROP CONSTRAINT "repository_installations_created_by_user_id_fkey";
ALTER TABLE "repository_installations" ALTER COLUMN "created_by_user_id" DROP NOT NULL;

-- Re-add FK constraints as nullable (SET NULL on delete so orphan rows are handled cleanly)
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_owned_by_user_id_fkey"
    FOREIGN KEY ("owned_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "repository_installations" ADD CONSTRAINT "repository_installations_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "ReviewJobStatus" AS ENUM ('pending', 'running', 'succeeded', 'failed');

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" TEXT NOT NULL,
    "github_delivery_id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "action" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_jobs" (
    "id" TEXT NOT NULL,
    "status" "ReviewJobStatus" NOT NULL DEFAULT 'pending',
    "installation_id" BIGINT NOT NULL,
    "repository_id" BIGINT NOT NULL,
    "pr_number" INTEGER NOT NULL,
    "head_sha" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "lease_expires_at" TIMESTAMP(3),
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "review_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "webhook_deliveries_github_delivery_id_key" ON "webhook_deliveries"("github_delivery_id");

-- CreateIndex
CREATE INDEX "webhook_deliveries_received_at_idx" ON "webhook_deliveries"("received_at");

-- CreateIndex
CREATE INDEX "review_jobs_status_lease_expires_at_idx" ON "review_jobs"("status", "lease_expires_at");

-- CreateIndex
CREATE INDEX "review_jobs_created_at_idx" ON "review_jobs"("created_at");
