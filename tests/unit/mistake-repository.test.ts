import { beforeAll, beforeEach, describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "file:./dev.db";

describe("mistake repository", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let analyzeWithSimulation: typeof import("@/lib/analyzer/simulated").analyzeWithSimulation;
  let saveAnalysisAsMistake: typeof import("@/lib/repositories/mistakes").saveAnalysisAsMistake;

  beforeAll(async () => {
    [{ prisma }, { analyzeWithSimulation }, { saveAnalysisAsMistake }] = await Promise.all([
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
    const analysis = await analyzeWithSimulation({ filename: "a.png" });
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
    const second = await saveAnalysisAsMistake({ studentId: "default-student", imagePath: "uploads/b.png", analysis });

    expect(second.gap.repeatedArchetypeCount).toBe(2);
    expect(second.gap.severity).toBe("repeated_archetype");
    expect(second.gap.severityRank).toBe(3);
  });
});
