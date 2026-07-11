ALTER TABLE "Mistake" ADD COLUMN "contentStatus" TEXT NOT NULL DEFAULT 'complete';
ALTER TABLE "Mistake" ADD COLUMN "contentJson" TEXT;
ALTER TABLE "Mistake" ADD COLUMN "contentError" TEXT;
ALTER TABLE "Mistake" ADD COLUMN "contentUpdatedAt" DATETIME;
