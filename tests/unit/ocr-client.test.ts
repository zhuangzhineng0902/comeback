import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeImageWithOcr } from "@/lib/ocr/client";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OCR_SERVICE_URL;
});

describe("OCR client", () => {
  it("normalizes text blocks and question candidates from the OCR service", async () => {
    process.env.OCR_SERVICE_URL = "http://localhost:5005/ocr";
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          engine: "paddleocr",
          rawText: "1. 解方程 x + 2 = 5\n学生答案：x = 2",
          textBlocks: [
            { text: "1. 解方程 x + 2 = 5", bbox: [10, "20", 300, 60], confidence: "0.96", role: "question" },
            { text: "学生答案：x = 2", bbox: [320, 90, 480, 130], score: 0.84, role: "studentAnswer" }
          ],
          questionCandidates: [
            {
              questionId: "1",
              text: "解方程 x + 2 = 5",
              bbox: [10, 20, 480, 130],
              confidence: 0.9
            }
          ],
          gradingMarks: [
            { markType: "cross", bbox: [500, 95, 540, 135], confidence: "0.88", source: "red-ink" }
          ],
          mistakeCandidates: [
            {
              questionId: "1",
              text: "解方程 x + 2 = 5",
              bbox: [10, 20, 540, 135],
              confidence: 0.86,
              markTypes: ["cross"],
              judgement: "wrong",
              evidenceSummary: "题目旁有红叉。"
            }
          ],
          debugArtifacts: [
            { kind: "combined-ocr", path: "/tmp/debug.jpg", url: "/debug-artifacts/debug.jpg" }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await analyzeImageWithOcr({
      filename: "paper.png",
      mimeType: "image/png",
      imageBase64: Buffer.from("image-bytes").toString("base64"),
      originalImageBase64: Buffer.from("original-image-bytes").toString("base64"),
      originalMimeType: "image/png",
      debugArtifacts: true,
      sourceImageIndex: 0
    });

    expect(result).toMatchObject({
      sourceImageIndex: 0,
      engine: "ocr",
      status: "available",
      rawText: "1. 解方程 x + 2 = 5\n学生答案：x = 2",
      textBlocks: [
        { text: "1. 解方程 x + 2 = 5", bbox: [10, 20, 300, 60], confidence: 0.96, role: "question" },
        { text: "学生答案：x = 2", bbox: [320, 90, 480, 130], confidence: 0.84, role: "studentAnswer" }
      ],
      questionCandidates: [{ questionId: "1", text: "解方程 x + 2 = 5", bbox: [10, 20, 480, 130], confidence: 0.9 }],
      gradingMarks: [{ markType: "cross", bbox: [500, 95, 540, 135], confidence: 0.88, source: "red-ink" }],
      mistakeCandidates: [
        {
          questionId: "1",
          text: "解方程 x + 2 = 5",
          bbox: [10, 20, 540, 135],
          confidence: 0.86,
          markTypes: ["cross"],
          judgement: "wrong",
          evidenceSummary: "题目旁有红叉。"
        }
      ],
      debugArtifacts: [
        { kind: "combined-ocr", path: "/tmp/debug.jpg", url: "/debug-artifacts/debug.jpg" }
      ]
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:5005/ocr",
      expect.objectContaining({ method: "POST", body: expect.any(FormData) })
    );
    const requestBody = fetchMock.mock.calls[0]?.[1]?.body as FormData;
    expect(requestBody.get("image")).toBeInstanceOf(Blob);
    expect(requestBody.get("originalImage")).toBeInstanceOf(Blob);
    expect(requestBody.get("debug")).toBe("true");
  });

  it("returns null when OCR_SERVICE_URL is not configured", async () => {
    vi.stubGlobal("fetch", vi.fn());

    await expect(
      analyzeImageWithOcr({
        filename: "paper.png",
        mimeType: "image/png",
        imageBase64: Buffer.from("image-bytes").toString("base64"),
        sourceImageIndex: 0
      })
    ).resolves.toBeNull();
  });

  it("keeps OCR service error details in the failed context summary", async () => {
    process.env.OCR_SERVICE_URL = "http://localhost:5005/ocr";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ success: false, error: "ocr failed: model busy" }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        })
      )
    );

    const result = await analyzeImageWithOcr({
      filename: "paper.png",
      mimeType: "image/png",
      imageBase64: Buffer.from("image-bytes").toString("base64"),
      sourceImageIndex: 0
    });

    expect(result).toMatchObject({
      engine: "ocr",
      status: "failed",
      summary: expect.stringContaining("model busy")
    });
  });
});
