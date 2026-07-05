ALTER TABLE "Mistake" ADD COLUMN "aiJudgement" TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE "Mistake" ADD COLUMN "needsManualReview" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Mistake" ADD COLUMN "reviewStatus" TEXT NOT NULL DEFAULT 'not_required';
ALTER TABLE "Mistake" ADD COLUMN "reviewNote" TEXT;
ALTER TABLE "Mistake" ADD COLUMN "reviewedAt" DATETIME;
