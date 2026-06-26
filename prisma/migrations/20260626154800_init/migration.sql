-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "currentGrade" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Mistake" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "imagePath" TEXT NOT NULL,
    "recognizedText" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "questionType" TEXT NOT NULL,
    "studentAnswer" TEXT NOT NULL,
    "correctAnswer" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "mistakeReason" TEXT NOT NULL,
    "masteryStatus" TEXT NOT NULL DEFAULT 'new',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Mistake_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KnowledgePoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subject" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "chapter" TEXT NOT NULL,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "KnowledgePoint_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "KnowledgePoint" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KnowledgeGap" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "knowledgePointId" TEXT NOT NULL,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "relatedMistakeCount" INTEGER NOT NULL DEFAULT 0,
    "repeatedArchetypeCount" INTEGER NOT NULL DEFAULT 0,
    "severity" TEXT NOT NULL DEFAULT 'normal',
    "typicalReasons" TEXT NOT NULL DEFAULT '[]',
    "lastOccurredAt" DATETIME,
    "masteryLevel" INTEGER NOT NULL DEFAULT 0,
    "reviewSuggestion" TEXT NOT NULL,
    CONSTRAINT "KnowledgeGap_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "KnowledgeGap_knowledgePointId_fkey" FOREIGN KEY ("knowledgePointId") REFERENCES "KnowledgePoint" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Archetype" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subject" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "knowledgePointId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "solutionTemplate" TEXT NOT NULL,
    "commonTraps" TEXT NOT NULL,
    CONSTRAINT "Archetype_knowledgePointId_fkey" FOREIGN KEY ("knowledgePointId") REFERENCES "KnowledgePoint" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MistakeArchetype" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mistakeId" TEXT NOT NULL,
    "archetypeId" TEXT NOT NULL,
    "similarityScore" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MistakeArchetype_mistakeId_fkey" FOREIGN KEY ("mistakeId") REFERENCES "Mistake" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MistakeArchetype_archetypeId_fkey" FOREIGN KEY ("archetypeId") REFERENCES "Archetype" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TutorMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mistakeId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TutorMessage_mistakeId_fkey" FOREIGN KEY ("mistakeId") REFERENCES "Mistake" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NonStudyRequestLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "contentSummary" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NonStudyRequestLog_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Mistake_studentId_subject_grade_idx" ON "Mistake"("studentId", "subject", "grade");

-- CreateIndex
CREATE INDEX "KnowledgePoint_subject_grade_idx" ON "KnowledgePoint"("subject", "grade");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgePoint_subject_grade_name_key" ON "KnowledgePoint"("subject", "grade", "name");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeGap_studentId_knowledgePointId_key" ON "KnowledgeGap"("studentId", "knowledgePointId");

-- CreateIndex
CREATE UNIQUE INDEX "Archetype_subject_grade_knowledgePointId_title_key" ON "Archetype"("subject", "grade", "knowledgePointId", "title");

-- CreateIndex
CREATE INDEX "MistakeArchetype_archetypeId_idx" ON "MistakeArchetype"("archetypeId");
