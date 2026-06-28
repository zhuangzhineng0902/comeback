import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeMistake } from "@/lib/analyzer";
import { analyzeWithSimulation } from "@/lib/analyzer/simulated";

const minimaxAnalysis = {
  subject: "数学",
  grade: "八年级",
  questionType: "一次函数应用题",
  recognizedText: "已知一次函数 y = 2x - 3，判断图像经过的象限。",
  studentAnswer: "第四象限",
  correctAnswer: "第一、三、四象限",
  knowledgePoints: [{ name: "一次函数图像与性质", confidence: 0.95 }],
  mistakeReason: "只看 b，没有看 k。",
  studentFriendlyExplanation: "先看 k 的正负，再看 b 的位置。",
  example: "y=x-1 也要同时看 k 和 b。",
  archetype: {
    title: "一次函数图像性质判断母题",
    pattern: "根据 k 和 b 判断图像",
    solutionTemplate: "先看 k，再看 b，最后合并象限。",
    commonTraps: ["只看截距"]
  },
  practiceQuestions: [{ question: "y=-x+2 经过哪些象限？", answer: "一二四", hint: "先看 k<0。" }]
};

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.MINIMAX_API_KEY;
  delete process.env.MINIMAX_MODEL;
});

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

  it("uses MiniMax mode when a MiniMax key and image bytes are present", async () => {
    process.env.MINIMAX_API_KEY = "test-minimax-key";
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(minimaxAnalysis) } }]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await analyzeMistake({
      filename: "worksheet.png",
      mimeType: "image/png",
      imageBase64: Buffer.from("image-bytes").toString("base64"),
      subjectHint: "数学",
      gradeHint: "八年级"
    });

    expect(result.mode).toBe("api");
    expect(result.analysis.questionType).toBe("一次函数应用题");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.minimaxi.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-minimax-key",
          "Content-Type": "application/json"
        })
      })
    );
  });

  it("allows overriding the MiniMax base URL for compatible deployments", async () => {
    process.env.MINIMAX_API_KEY = "test-minimax-key";
    process.env.MINIMAX_BASE_URL = "https://example.test/v1";
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(minimaxAnalysis) } }]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await analyzeMistake({
      filename: "worksheet.png",
      mimeType: "image/png",
      imageBase64: Buffer.from("image-bytes").toString("base64")
    });

    expect(fetchMock).toHaveBeenCalledWith("https://example.test/v1/chat/completions", expect.any(Object));
  });

  it("falls back to simulation when MiniMax returns unparseable content", async () => {
    process.env.MINIMAX_API_KEY = "test-minimax-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: "not-json" } }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
    );

    const result = await analyzeMistake({
      filename: "worksheet.png",
      mimeType: "image/png",
      imageBase64: Buffer.from("image-bytes").toString("base64")
    });

    expect(result.mode).toBe("simulation");
    expect(result.analysis.knowledgePoints[0].name).toBe("一次函数图像与性质");
  });
});
