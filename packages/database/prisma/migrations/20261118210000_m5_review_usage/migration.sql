-- AlterTable
ALTER TABLE "reviews" ADD COLUMN "estimated_cost_usd" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "review_usages" (
    "id" TEXT NOT NULL,
    "review_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "catalog_version" INTEGER NOT NULL,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "estimated_cost_usd" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "skipped_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_usages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "review_usages_review_id_idx" ON "review_usages"("review_id");

-- AddForeignKey
ALTER TABLE "review_usages" ADD CONSTRAINT "review_usages_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
