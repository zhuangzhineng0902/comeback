import { spawnSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const prismaCli = require.resolve("prisma/build/index.js");
const tsxCli = require.resolve("tsx/cli");
const databaseUrl = "file:./test-mistake-repository.db";
const databaseFiles = ["prisma/test-mistake-repository.db", "prisma/test-mistake-repository.db-journal"];

process.env.DATABASE_URL = databaseUrl;

function runSetupCommand(command: string, args: string[]) {
  const env = { ...process.env, DATABASE_URL: databaseUrl };
  delete env.RUST_LOG;

  const result = spawnSync(process.execPath, [command, ...args], {
    cwd: process.cwd(),
    env,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    throw new Error(`Test database setup failed: ${command} ${args.join(" ")}`);
  }
}

function resetTestDatabase() {
  for (const file of databaseFiles) {
    if (existsSync(file)) {
      unlinkSync(file);
    }
  }

  runSetupCommand(prismaCli, ["migrate", "deploy"]);
  runSetupCommand(tsxCli, ["prisma/seed.ts"]);
}

describe("mistake repository", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let analyzeWithSimulation: typeof import("@/lib/analyzer/simulated").analyzeWithSimulation;
  let saveAnalysisAsMistake: typeof import("@/lib/repositories/mistakes").saveAnalysisAsMistake;
  let updateMistakeManualReview: typeof import("@/lib/repositories/mistakes").updateMistakeManualReview;

  beforeAll(async () => {
    resetTestDatabase();

    [{ prisma }, { analyzeWithSimulation }, { saveAnalysisAsMistake, updateMistakeManualReview }] = await Promise.all([
      import("@/lib/db"),
      import("@/lib/analyzer/simulated"),
      import("@/lib/repositories/mistakes")
    ]);
  });

  beforeEach(async () => {
    await prisma.tutorMessage.deleteMany();
    await prisma.mistakeArchetype.deleteMany();
    await prisma.mistake.deleteMany();
    await prisma.knowledgeGap.deleteMany();
  });

  it("stores an analysis and creates a knowledge gap", async () => {
    const analysis = await analyzeWithSimulation({ filename: "a.png", subjectHint: "数学", gradeHint: "八年级" });
    const result = await saveAnalysisAsMistake({
      studentId: "default-student",
      imagePath: "uploads/a.png",
      analysis
    });

    expect(result.mistake.subject).toBe("数学");
    expect(result.gap.errorCount).toBe(1);
    expect(result.gap.severity).toBe("normal");
    expect(result.gap.severityRank).toBe(0);
  });

  it("marks repeated archetype mistakes as high priority", async () => {
    const analysis = await analyzeWithSimulation({ filename: "a.png" });
    await saveAnalysisAsMistake({ studentId: "default-student", imagePath: "uploads/a.png", analysis });
    const second = await saveAnalysisAsMistake({
      studentId: "default-student",
      imagePath: "uploads/b.png",
      analysis: {
        ...analysis,
        recognizedText: `${analysis.recognizedText} 第二次同类变式`
      }
    });

    expect(second.gap.repeatedArchetypeCount).toBe(2);
    expect(second.gap.severity).toBe("repeated_archetype");
    expect(second.gap.severityRank).toBe(3);
  });

  it("does not stack error counts for the same question submitted repeatedly", async () => {
    const analysis = await analyzeWithSimulation({ filename: "a.png", subjectHint: "数学", gradeHint: "八年级" });
    const first = await saveAnalysisAsMistake({ studentId: "default-student", imagePath: "uploads/a.png", analysis });
    const duplicate = await saveAnalysisAsMistake({
      studentId: "default-student",
      imagePath: "uploads/b.png",
      analysis: {
        ...analysis,
        recognizedText: ` ${analysis.recognizedText.replace(/\s+/g, " ")} `
      }
    });
    const mistakeCount = await prisma.mistake.count({ where: { studentId: "default-student" } });

    expect(duplicate.mistake.id).toBe(first.mistake.id);
    expect(duplicate.gap.errorCount).toBe(1);
    expect(duplicate.gap.repeatedArchetypeCount).toBe(1);
    expect(mistakeCount).toBe(1);
  });

  it("reuses a confirmed review when OCR recognizes the same question differently", async () => {
    const analysis = await analyzeWithSimulation({ filename: "a.png", subjectHint: "数学", gradeHint: "八年级" });
    const pendingAnalysis = {
      ...analysis,
      gradingEvidence: {
        ...analysis.gradingEvidence!,
        judgement: "suspected" as const,
        needsConfirmation: true
      }
    };
    const first = await saveAnalysisAsMistake({ studentId: "default-student", imagePath: "uploads/a.png", analysis: pendingAnalysis });
    await updateMistakeManualReview({
      mistakeId: first.mistake.id,
      studentId: "default-student",
      reviewStatus: "confirmed_wrong"
    });

    const duplicate = await saveAnalysisAsMistake({
      studentId: "default-student",
      imagePath: "uploads/b.png",
      analysis: {
        ...pendingAnalysis,
        recognizedText: pendingAnalysis.recognizedText.replace("y = 2x - 3", "y=2x-3").replace("说明理由", "并说明理由")
      }
    });

    expect(duplicate.mistake.id).toBe(first.mistake.id);
    expect(duplicate.mistake.reviewStatus).toBe("confirmed_wrong");
    expect(await prisma.mistake.count({ where: { studentId: "default-student" } })).toBe(1);
  });

  it("does not reopen a manually rejected question when it is recognized again", async () => {
    const analysis = await analyzeWithSimulation({ filename: "a.png", subjectHint: "数学", gradeHint: "八年级" });
    const first = await saveAnalysisAsMistake({ studentId: "default-student", imagePath: "uploads/a.png", analysis });
    await updateMistakeManualReview({
      mistakeId: first.mistake.id,
      studentId: "default-student",
      reviewStatus: "not_wrong"
    });

    const duplicate = await saveAnalysisAsMistake({
      studentId: "default-student",
      imagePath: "uploads/b.png",
      analysis: {
        ...analysis,
        gradingEvidence: { ...analysis.gradingEvidence!, judgement: "suspected", needsConfirmation: true }
      }
    });

    expect(duplicate.mistake.id).toBe(first.mistake.id);
    expect(duplicate.mistake.reviewStatus).toBe("not_wrong");
    expect(await prisma.mistake.count({ where: { studentId: "default-student" } })).toBe(1);
  });

  it("marks three mistakes on one knowledge point as important without repeated archetypes", async () => {
    const analysis = await analyzeWithSimulation({ filename: "a.png" });
    const analyses = ["母题 A", "母题 B", "母题 C"].map((title, index) => ({
      ...analysis,
      recognizedText: `${analysis.recognizedText} 不同题 ${index + 1}`,
      archetype: {
        ...analysis.archetype,
        title
      }
    }));

    await saveAnalysisAsMistake({ studentId: "default-student", imagePath: "uploads/a.png", analysis: analyses[0] });
    await saveAnalysisAsMistake({ studentId: "default-student", imagePath: "uploads/b.png", analysis: analyses[1] });
    const third = await saveAnalysisAsMistake({
      studentId: "default-student",
      imagePath: "uploads/c.png",
      analysis: analyses[2]
    });

    expect(third.gap.errorCount).toBe(3);
    expect(third.gap.repeatedArchetypeCount).toBe(1);
    expect(third.gap.severity).toBe("important");
    expect(third.gap.severityRank).toBe(2);
  });
});
