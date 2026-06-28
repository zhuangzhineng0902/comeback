import { describe, expect, it } from "vitest";
import { analyzeMistake } from "@/lib/analyzer";
import { analyzeWithSimulation } from "@/lib/analyzer/simulated";

describe("simulated analyzer", () => {
  it("returns a structured junior-high math analysis", async () => {
    const result = await analyzeWithSimulation({
      filename: "worksheet.png",
      subjectHint: "数学",
      gradeHint: "八年级"
    });

    expect(result.subject).toBe("数学");
    expect(result.grade).toBe("八年级");
    expect(result.knowledgePoints[0].name).toBe("一次函数图像与性质");
    expect(result.archetype.title).toBe("一次函数图像性质判断母题");
    expect(result.practiceQuestions).toHaveLength(3);
  });

  it("defaults missing hints to junior-high math", async () => {
    const result = await analyzeWithSimulation({ filename: "worksheet.png" });

    expect(result.subject).toBe("数学");
    expect(result.grade).toBe("八年级");
  });

  it("uses simulation mode even when an API key is present", async () => {
    const previousApiKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-api-key";

    try {
      const result = await analyzeMistake({ filename: "worksheet.png" });

      expect(result.mode).toBe("simulation");
    } finally {
      if (previousApiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previousApiKey;
      }
    }
  });
});
