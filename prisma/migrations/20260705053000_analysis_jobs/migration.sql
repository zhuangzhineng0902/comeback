-- CreateTable
CREATE TABLE "AnalysisBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "total" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AnalysisBatch_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AnalysisJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "imageIndex" INTEGER NOT NULL,
    "filename" TEXT NOT NULL,
    "imagePath" TEXT NOT NULL,
    "analysisImagePath" TEXT,
    "analysisMimeType" TEXT NOT NULL,
    "subjectHint" TEXT,
    "gradeHint" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "paperVisionContextJson" TEXT,
    "analysesJson" TEXT,
    "savedMistakesJson" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AnalysisJob_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "AnalysisBatch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AnalysisJob_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AnalysisBatch_studentId_createdAt_idx" ON "AnalysisBatch"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "AnalysisJob_batchId_imageIndex_idx" ON "AnalysisJob"("batchId", "imageIndex");

-- CreateIndex
CREATE INDEX "AnalysisJob_status_createdAt_idx" ON "AnalysisJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AnalysisJob_studentId_createdAt_idx" ON "AnalysisJob"("studentId", "createdAt");
