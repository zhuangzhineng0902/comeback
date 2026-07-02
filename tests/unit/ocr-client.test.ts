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
      questionCandidates: [{ questionId: "1", text: "解方程 x + 2 = 5", bbox: [10, 20, 480, 130], confidence: 0.9 }]
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:5005/ocr",
      expect.objectContaining({ method: "POST", body: expect.any(FormData) })
    );
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
});
