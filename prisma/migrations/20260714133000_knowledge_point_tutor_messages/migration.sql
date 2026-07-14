CREATE TABLE "KnowledgePointTutorMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "knowledgePointId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KnowledgePointTutorMessage_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "KnowledgePointTutorMessage_knowledgePointId_fkey" FOREIGN KEY ("knowledgePointId") REFERENCES "KnowledgePoint" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "KnowledgePointTutorMessage_studentId_knowledgePointId_createdAt_idx" ON "KnowledgePointTutorMessage"("studentId", "knowledgePointId", "createdAt");
CREATE INDEX "KnowledgePointTutorMessage_knowledgePointId_idx" ON "KnowledgePointTutorMessage"("knowledgePointId");
