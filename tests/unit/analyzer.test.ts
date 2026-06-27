import { describe, expect, it } from "vitest";
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
});
