import { mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const analysis = {
  subject: "数学",
  grade: "八年级",
  questionType: "选择题",
  recognizedText: "一次函数题目",
  studentAnswer: "A",
  correctAnswer: "B",
  knowledgePoints: [{ name: "一次函数图像与性质", confidence: 0.9 }],
  mistakeReason: "忽略斜率符号",
  studentFriendlyExplanation: "先看斜率，再看截距。",
  example: "y=2x+1",
  archetype: {
    title: "一次函数图像性质判断母题",
    pattern: "判断一次函数图像",
    solutionTemplate: "看 k 和 b",
    commonTraps: ["把 k 和 b 混淆"]
  },
  practiceQuestions: [{ question: "y=x+1 经过几象限？", answer: "一二三", hint: "看 k 和 b" }]
};

const analyzeMistakeMock = vi.fn();
const saveAnalysisAsMistakeMock = vi.fn();
const analyzeImageWithOcrMock = vi.fn();
const execFileMock = vi.hoisted(() => vi.fn());
const testUploadRoots: string[] = [];
const prismaMock = {
  mistake: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn()
  },
  knowledgeGap: {
    findFirst: vi.fn(),
    findMany: vi.fn()
  },
  knowledgePoint: {
    findFirst: vi.fn(),
    findMany: vi.fn()
  },
  archetype: {
    findMany: vi.fn()
  },
  nonStudyRequestLog: {
    create: vi.fn()
  },
  tutorMessage: {
    createMany: vi.fn()
  },
  analysisBatch: {
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn()
  },
  analysisJob: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn()
  }
};

const activeReviewWhere = {
  OR: [
    { needsManualReview: false, reviewStatus: { not: "not_wrong" } },
    { reviewStatus: "confirmed_wrong" }
  ],
  NOT: [
    { questionType: { contains: "OCR" } },
    { questionType: { contains: "复核" } },
    { correctAnswer: { contains: "人工复核" } },
    { correctAnswer: { contains: "重新推导" } },
    { mistakeReason: { contains: "复核" } },
    {
      mistakeArchetypes: {
        some: {
          archetype: {
            OR: [
              { title: { contains: "OCR" } },
              { title: { contains: "复核" } },
              { pattern: { contains: "复核" } },
              { solutionTemplate: { contains: "复核" } }
            ]
          }
        }
      }
    }
  ]
};

vi.mock("@/lib/analyzer", () => ({
  analyzeMistake: analyzeMistakeMock
}));

vi.mock("@/lib/repositories/mistakes", () => ({
  saveAnalysisAsMistake: saveAnalysisAsMistakeMock
}));

vi.mock("@/lib/ocr/client", () => ({
  analyzeImageWithOcr: analyzeImageWithOcrMock
}));

vi.mock("@/lib/db", () => ({
  prisma: prismaMock
}));

vi.mock("node:child_process", () => ({
  default: { execFile: execFileMock },
  execFile: execFileMock
}));

describe("api routes", () => {
  beforeEach(async () => {
    const uploadRoot = await mkdtemp(path.join(tmpdir(), "private-tutor-route-uploads-"));
    testUploadRoots.push(uploadRoot);
    process.env.UPLOAD_ROOT_DIR = uploadRoot;
    delete process.env.ENABLE_AI_FALLBACK;
    analyzeMistakeMock.mockReset();
    saveAnalysisAsMistakeMock.mockReset();
    analyzeImageWithOcrMock.mockReset();
    execFileMock.mockReset();
    prismaMock.mistake.findFirst.mockReset();
    prismaMock.mistake.findMany.mockReset();
    prismaMock.mistake.findUnique.mockReset();
    prismaMock.knowledgeGap.findFirst.mockReset();
    prismaMock.knowledgeGap.findMany.mockReset();
    prismaMock.knowledgePoint.findFirst.mockReset();
    prismaMock.knowledgePoint.findMany.mockReset();
    prismaMock.archetype.findMany.mockReset();
    prismaMock.nonStudyRequestLog.create.mockReset();
    prismaMock.tutorMessage.createMany.mockReset();
    prismaMock.analysisBatch.create.mockReset();
    prismaMock.analysisBatch.findFirst.mockReset();
    prismaMock.analysisBatch.update.mockReset();
    prismaMock.analysisJob.findMany.mockReset();
    prismaMock.analysisJob.findUnique.mockReset();
    prismaMock.analysisJob.update.mockReset();
    prismaMock.analysisJob.updateMany.mockReset();
    prismaMock.analysisJob.findMany.mockResolvedValue([]);
  });

  afterEach(async () => {
    delete process.env.ENABLE_AI_FALLBACK;
    delete process.env.UPLOAD_ROOT_DIR;
    await Promise.all(testUploadRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("analyzes an uploaded mistake and saves the result", async () => {
    analyzeMistakeMock.mockResolvedValue({ mode: "simulation", analysis });
    saveAnalysisAsMistakeMock.mockResolvedValue({
      mistake: { id: "mistake-1" },
      gap: { severity: "normal" }
    });
    const { POST } = await import("@/app/api/analyze/route");
    const formData = new FormData();
    const file = new File(["image-bytes"], "paper photo.png", { type: "image/png" });
    Object.defineProperty(file, "arrayBuffer", {
      value: async () => new TextEncoder().encode("image-bytes").buffer
    });
    formData.set("file", file);
    formData.set("subjectHint", "数学");
    formData.set("gradeHint", "八年级");

    const response = await POST({ formData: async () => formData } as Request);

    await expect(response.json()).resolves.toMatchObject({
      mode: "simulation",
      mistakeId: "mistake-1",
      gapSeverity: "normal"
    });
    expect(analyzeMistakeMock).toHaveBeenCalledWith({
      filename: "paper photo.png",
      mimeType: "image/png",
      imageBase64: Buffer.from("image-bytes").toString("base64"),
      images: [
        { filename: "paper photo.png", mimeType: "image/png", imageBase64: Buffer.from("image-bytes").toString("base64") }
      ],
      subjectHint: "数学",
      gradeHint: "八年级",
      paperLayout: "independent_pages",
      analysisDetail: "compact",
      paperVisionContexts: undefined
    });
    expect(saveAnalysisAsMistakeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: "default-student",
        imagePath: expect.stringMatching(/^uploads\/[0-9a-f-]+-paper_photo\.png$/),
        analysis
      })
    );
  });

  it("stores uploaded files under the configured upload root", async () => {
    const uploadRoot = await mkdtemp(path.join(tmpdir(), "private-tutor-uploads-"));
    testUploadRoots.push(uploadRoot);
    process.env.UPLOAD_ROOT_DIR = uploadRoot;
    analyzeMistakeMock.mockResolvedValue({ mode: "simulation", analysis });
    saveAnalysisAsMistakeMock.mockResolvedValue({
      mistake: { id: "mistake-1" },
      gap: { severity: "normal" }
    });
    const { POST } = await import("@/app/api/analyze/route");
    const formData = new FormData();
    const file = new File(["image-bytes"], "paper.png", { type: "image/png" });
    Object.defineProperty(file, "arrayBuffer", {
      value: async () => new TextEncoder().encode("image-bytes").buffer
    });
    formData.set("file", file);

    const response = await POST({ formData: async () => formData } as Request);
    const body = await response.json();
    const savedFilename = path.basename(body.uploadedImages[0].url);

    expect(response.status).toBe(200);
    await expect(stat(path.join(uploadRoot, savedFilename))).resolves.toMatchObject({ isFile: expect.any(Function) });
    await expect(stat(path.join(process.cwd(), "uploads", savedFilename))).rejects.toThrow();
  });

  it("runs OCR before AI analysis and returns paper vision context", async () => {
    const paperVisionContext = {
      sourceImageIndex: 0,
      engine: "ocr",
      status: "available",
      summary: "识别 2 个文字块",
      rawText: "1. There ____ a book on the desk. 学生答案 B",
      textBlocks: [
        { text: "1. There ____ a book on the desk.", bbox: [10, 20, 300, 60], confidence: 0.96 },
        { text: "学生答案 B", bbox: [320, 80, 420, 120], confidence: 0.88 }
      ],
      questionCandidates: [
        { questionId: "1", text: "There ____ a book on the desk.", bbox: [10, 20, 420, 140], confidence: 0.9 }
      ]
    };
    analyzeImageWithOcrMock.mockResolvedValue(paperVisionContext);
    analyzeMistakeMock.mockResolvedValue({ mode: "api", analysis });
    saveAnalysisAsMistakeMock.mockResolvedValue({
      mistake: { id: "mistake-1" },
      gap: { severity: "normal" }
    });
    const { POST } = await import("@/app/api/analyze/route");
    const formData = new FormData();
    const file = new File(["image-bytes"], "paper.png", { type: "image/png" });
    Object.defineProperty(file, "arrayBuffer", {
      value: async () => new TextEncoder().encode("image-bytes").buffer
    });
    formData.set("file", file);

    const response = await POST({ formData: async () => formData } as Request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(analyzeImageWithOcrMock).toHaveBeenCalledWith({
      filename: "paper.png",
      mimeType: "image/png",
      imageBase64: Buffer.from("image-bytes").toString("base64"),
      originalImageBase64: Buffer.from("image-bytes").toString("base64"),
      originalMimeType: "image/png",
      sourceImageIndex: 0
    });
    expect(analyzeMistakeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        paperVisionContexts: [paperVisionContext]
      })
    );
    expect(body.paperVisionContexts).toEqual([paperVisionContext]);
    expect(body.imageGroups[0].paperVisionContext).toEqual(paperVisionContext);
  });

  it("analyzes up to sixteen uploaded images without subject or grade hints", async () => {
    prismaMock.analysisBatch.create.mockResolvedValue({
      id: "batch-1",
      status: "queued",
      total: 2,
      createdAt: new Date("2026-07-05T01:00:00.000Z"),
      updatedAt: new Date("2026-07-05T01:00:00.000Z"),
      jobs: [
        {
          id: "job-1",
          imageIndex: 0,
          filename: "page-1.png",
          imagePath: "uploads/page-1.png",
          status: "queued",
          retryCount: 0
        },
        {
          id: "job-2",
          imageIndex: 1,
          filename: "page-2.png",
          imagePath: "uploads/page-2.png",
          status: "queued",
          retryCount: 0
        }
      ]
    });
    const { POST } = await import("@/app/api/analyze/route");
    const formData = new FormData();
    for (let index = 1; index <= 2; index += 1) {
      const file = new File([`image-${index}`], `page-${index}.png`, { type: "image/png" });
      Object.defineProperty(file, "arrayBuffer", {
        value: async () => new TextEncoder().encode(`image-${index}`).buffer
      });
      formData.append("files", file);
    }

    const response = await POST({ formData: async () => formData } as Request);

    const body = await response.json();
    expect(response.status).toBe(202);
    expect(body).toMatchObject({
      mode: "queued",
      batch: { id: "batch-1", status: "queued", total: 2 },
      jobs: [
        { id: "job-1", imageIndex: 0, filename: "page-1.png", status: "queued" },
        { id: "job-2", imageIndex: 1, filename: "page-2.png", status: "queued" }
      ]
    });
    expect(prismaMock.analysisBatch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          studentId: "default-student",
          status: "queued",
          total: 2,
          jobs: expect.objectContaining({
            create: [
              expect.objectContaining({ imageIndex: 0, filename: "page-1.png", status: "queued" }),
              expect.objectContaining({ imageIndex: 1, filename: "page-2.png", status: "queued" })
            ]
          })
        })
      })
    );
    expect(analyzeMistakeMock).not.toHaveBeenCalled();
    expect(saveAnalysisAsMistakeMock).not.toHaveBeenCalled();
  });

  it("creates one combined job when the final image is an answer sheet", async () => {
    prismaMock.analysisBatch.create.mockResolvedValue({
      id: "combined-batch",
      status: "queued",
      createdAt: new Date("2026-07-11T01:00:00.000Z"),
      updatedAt: new Date("2026-07-11T01:00:00.000Z"),
      jobs: [{ id: "combined-job", imageIndex: 0, status: "queued", retryCount: 0 }]
    });
    const { POST } = await import("@/app/api/analyze/route");
    const formData = new FormData();
    for (const [filename, bytes] of [["题目第1页.png", "question-one"], ["题目第2页.png", "question-two"], ["答题卡.png", "answer-sheet"]]) {
      const file = new File([bytes], filename, { type: "image/png" });
      Object.defineProperty(file, "arrayBuffer", { value: async () => new TextEncoder().encode(bytes).buffer });
      formData.append("files", file);
    }
    formData.set("paperMode", "question_pages_with_answer_sheet");

    const response = await POST({ formData: async () => formData } as Request);

    expect(response.status).toBe(202);
    expect(prismaMock.analysisBatch.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        total: 1,
        jobs: expect.objectContaining({
          create: expect.objectContaining({
            relatedImagesJson: expect.stringContaining('"role":"unknown"')
          })
        })
      })
    }));
  });

  it("returns an analysis batch with succeeded and failed job states", async () => {
    prismaMock.analysisBatch.findFirst.mockResolvedValue({
      id: "batch-1",
      status: "partial",
      total: 2,
      createdAt: new Date("2026-07-05T01:00:00.000Z"),
      updatedAt: new Date("2026-07-05T01:02:00.000Z"),
      jobs: [
        {
          id: "job-1",
          imageIndex: 0,
          filename: "page-1.png",
          imagePath: "uploads/page-1.png",
          status: "succeeded",
          retryCount: 0,
          errorMessage: null,
          startedAt: new Date("2026-07-05T01:00:01.000Z"),
          completedAt: new Date("2026-07-05T01:00:20.000Z"),
          paperVisionContextJson: null,
          analysesJson: JSON.stringify([analysis]),
          savedMistakesJson: JSON.stringify([{ mistakeId: "mistake-1", gapSeverity: "important" }])
        },
        {
          id: "job-2",
          imageIndex: 1,
          filename: "page-2.png",
          imagePath: "uploads/page-2.png",
          status: "failed",
          retryCount: 1,
          errorMessage: "MiniMax JSON parse failed",
          startedAt: new Date("2026-07-05T01:00:01.000Z"),
          completedAt: new Date("2026-07-05T01:00:20.000Z"),
          paperVisionContextJson: null,
          analysesJson: null,
          savedMistakesJson: null
        }
      ]
    });
    const { GET } = await import("@/app/api/analysis-batches/[id]/route");

    const response = await GET(new Request("http://localhost/api/analysis-batches/batch-1"), {
      params: Promise.resolve({ id: "batch-1" })
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.batch).toMatchObject({ id: "batch-1", status: "partial", completed: 2, succeeded: 1, failed: 1 });
    expect(body.jobs[0]).toMatchObject({ id: "job-1", status: "succeeded", analyses: [{ questionType: "选择题" }] });
    expect(body.jobs[1]).toMatchObject({ id: "job-2", status: "failed", errorMessage: "MiniMax JSON parse failed" });
    expect(body.result).toMatchObject({
      analysis: { questionType: "选择题" },
      imageGroups: [
        { status: "succeeded", analyses: [{ questionType: "选择题" }] },
        { status: "failed", errorMessage: "MiniMax JSON parse failed" }
      ]
    });
  });

  it("retries failed analysis jobs in a batch", async () => {
    prismaMock.analysisJob.findMany.mockResolvedValue([{ id: "job-2" }]);
    prismaMock.analysisJob.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.analysisBatch.update.mockResolvedValue({ id: "batch-1" });
    const { POST } = await import("@/app/api/analysis-batches/[id]/retry/route");

    const response = await POST(
      new Request("http://localhost/api/analysis-batches/batch-1/retry", {
        method: "POST",
        body: JSON.stringify({ jobIds: ["job-2"] })
      }),
      { params: Promise.resolve({ id: "batch-1" }) }
    );

    await expect(response.json()).resolves.toEqual({ retried: 1 });
    expect(prismaMock.analysisJob.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["job-2"] } },
      data: {
        status: "queued",
        retryCount: { increment: 1 },
        errorMessage: null,
        startedAt: null,
        completedAt: null
      }
    });
  });

  it("converts HEIC uploads to JPEG before sending images to the analyzer", async () => {
    execFileMock.mockImplementation((command: string, args: string[], callback: (error: Error | null, stdout?: string, stderr?: string) => void) => {
      const outputPath = args[args.indexOf("--out") + 1];
      void writeFile(outputPath, "converted-jpeg-bytes").then(
        () => callback(null, "", ""),
        (error) => callback(error)
      );
      return {};
    });
    analyzeMistakeMock.mockResolvedValue({ mode: "api", analysis });
    saveAnalysisAsMistakeMock.mockResolvedValue({
      mistake: { id: "mistake-1" },
      gap: { severity: "normal" }
    });
    const { POST } = await import("@/app/api/analyze/route");
    const formData = new FormData();
    const file = new File(["heic-image-bytes"], "paper.heic", { type: "image/heic" });
    Object.defineProperty(file, "arrayBuffer", {
      value: async () => new TextEncoder().encode("heic-image-bytes").buffer
    });
    formData.set("file", file);

    const response = await POST({ formData: async () => formData } as Request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.uploadedImages[0].url).toMatch(/^\/api\/uploads\/[0-9a-f-]+-paper\.heic$/);
    expect(execFileMock).toHaveBeenCalledWith(
      "sips",
      expect.arrayContaining(["-s", "format", "jpeg", "--out"]),
      expect.any(Function)
    );
    expect(analyzeMistakeMock).toHaveBeenCalledWith({
      filename: "paper.heic",
      mimeType: "image/jpeg",
      imageBase64: Buffer.from("converted-jpeg-bytes").toString("base64"),
      images: [
        {
          filename: "paper.heic",
          mimeType: "image/jpeg",
          imageBase64: Buffer.from("converted-jpeg-bytes").toString("base64")
        }
      ],
      subjectHint: undefined,
      gradeHint: undefined,
      paperLayout: "independent_pages",
      analysisDetail: "compact",
      paperVisionContexts: undefined
    });
  });

  it("rejects more than sixteen uploaded images", async () => {
    const { POST } = await import("@/app/api/analyze/route");
    const formData = new FormData();
    for (let index = 1; index <= 17; index += 1) {
      formData.append("files", new File(["image"], `page-${index}.png`, { type: "image/png" }));
    }

    const response = await POST({ formData: async () => formData } as Request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "一次最多上传 16 张图片。" });
    expect(analyzeMistakeMock).not.toHaveBeenCalled();
  });

  it("rejects analyze requests without an uploaded file", async () => {
    const { POST } = await import("@/app/api/analyze/route");

    const response = await POST({ formData: async () => new FormData() } as Request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "请先上传至少一张试卷或习题照片。" });
  });

  it("rejects non-image uploads before analysis", async () => {
    const { POST } = await import("@/app/api/analyze/route");
    const formData = new FormData();
    formData.set("file", new File(["not-image"], "notes.txt", { type: "text/plain" }));

    const response = await POST({ formData: async () => formData } as Request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "请上传 JPG、PNG、WebP 或 HEIC 格式的图片。" });
    expect(analyzeMistakeMock).not.toHaveBeenCalled();
  });

  it("rejects oversized image uploads before buffering", async () => {
    const { POST } = await import("@/app/api/analyze/route");
    const formData = new FormData();
    const file = new File(["image-bytes"], "large.png", { type: "image/png" });
    Object.defineProperty(file, "size", { value: 8 * 1024 * 1024 + 1 });
    Object.defineProperty(file, "arrayBuffer", {
      value: vi.fn(async () => new TextEncoder().encode("image-bytes").buffer)
    });
    formData.set("file", file);

    const response = await POST({ formData: async () => formData } as Request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "单张图片不能超过 8MB，请压缩后再上传。" });
    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(analyzeMistakeMock).not.toHaveBeenCalled();
  });

  it("deletes uploaded files when analysis persistence fails", async () => {
    analyzeMistakeMock.mockResolvedValue({ mode: "simulation", analysis });
    saveAnalysisAsMistakeMock.mockRejectedValue(new Error("database unavailable"));
    const { POST } = await import("@/app/api/analyze/route");
    const formData = new FormData();
    const file = new File(["image-bytes"], "paper.png", { type: "image/png" });
    Object.defineProperty(file, "arrayBuffer", {
      value: async () => new TextEncoder().encode("image-bytes").buffer
    });
    formData.set("file", file);

    const response = await POST({ formData: async () => formData } as Request);
    const files = await readdir(process.env.UPLOAD_ROOT_DIR as string);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "分析失败，请稍后重试。" });
    expect(files).toEqual([]);
  });

  it("returns an explicit error instead of mock fallback when real AI analysis fails", async () => {
    analyzeMistakeMock.mockRejectedValue(new Error("MiniMax response could not be parsed: malformed JSON"));
    const { POST } = await import("@/app/api/analyze/route");
    const formData = new FormData();
    const file = new File(["image-bytes"], "paper.png", { type: "image/png" });
    Object.defineProperty(file, "arrayBuffer", {
      value: async () => new TextEncoder().encode("image-bytes").buffer
    });
    formData.set("file", file);

    const response = await POST({ formData: async () => formData } as Request);
    const files = await readdir(process.env.UPLOAD_ROOT_DIR as string);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "真实 AI 分析失败，请稍后重试。" });
    expect(files).toEqual([]);
    expect(saveAnalysisAsMistakeMock).not.toHaveBeenCalled();
  });

  it("falls back to simulation only when ENABLE_AI_FALLBACK is true", async () => {
    process.env.ENABLE_AI_FALLBACK = "true";
    analyzeMistakeMock.mockRejectedValue(new Error("MiniMax response could not be parsed: malformed JSON"));
    saveAnalysisAsMistakeMock.mockResolvedValue({
      mistake: { id: "mistake-1" },
      gap: { severity: "normal" }
    });
    const { POST } = await import("@/app/api/analyze/route");
    const formData = new FormData();
    const file = new File(["image-bytes"], "paper.png", { type: "image/png" });
    Object.defineProperty(file, "arrayBuffer", {
      value: async () => new TextEncoder().encode("image-bytes").buffer
    });
    formData.set("file", file);

    const response = await POST({ formData: async () => formData } as Request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.mode).toBe("simulation");
    expect(body.analysis.questionType).toBeTruthy();
    expect(body.uploadedImages[0]).toMatchObject({ index: 0, filename: "paper.png" });
    expect(saveAnalysisAsMistakeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: "default-student",
        imagePath: expect.stringMatching(/^uploads\/[0-9a-f-]+-paper\.png$/)
      })
    );
  });

  it("stores study chat messages for a mistake", async () => {
    prismaMock.mistake.findFirst.mockResolvedValue({ id: "mistake-1" });
    const { POST } = await import("@/app/api/chat/route");

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({ mistakeId: "mistake-1", message: "这道数学题怎么做？" })
      })
    );

    const body = await response.json();
    expect(body.blocked).toBe(false);
    expect(body.reply).toContain("这道数学题怎么做？");
    expect(prismaMock.mistake.findFirst).toHaveBeenCalledWith({
      where: { id: "mistake-1", studentId: "default-student", ...activeReviewWhere }
    });
    expect(prismaMock.tutorMessage.createMany).toHaveBeenCalledWith({
      data: [
        { mistakeId: "mistake-1", role: "user", content: "这道数学题怎么做？" },
        { mistakeId: "mistake-1", role: "assistant", content: body.reply }
      ]
    });
  });

  it("returns 404 for an invalid mistake id without storing chat messages", async () => {
    prismaMock.mistake.findFirst.mockResolvedValue(null);
    const { POST } = await import("@/app/api/chat/route");

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({ mistakeId: "missing-mistake", message: "这道数学题怎么做？" })
      })
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "错题不存在。" });
    expect(prismaMock.mistake.findFirst).toHaveBeenCalledWith({
      where: { id: "missing-mistake", studentId: "default-student", ...activeReviewWhere }
    });
    expect(prismaMock.tutorMessage.createMany).not.toHaveBeenCalled();
  });

  it("checks supplied mistake ids before blocking non-study chat", async () => {
    prismaMock.mistake.findFirst.mockResolvedValue(null);
    const { POST } = await import("@/app/api/chat/route");

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({ mistakeId: "missing-mistake", message: "推荐一个游戏" })
      })
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "错题不存在。" });
    expect(prismaMock.nonStudyRequestLog.create).not.toHaveBeenCalled();
    expect(prismaMock.tutorMessage.createMany).not.toHaveBeenCalled();
  });

  it("allows study chat without a mistake id and skips persistence", async () => {
    const { POST } = await import("@/app/api/chat/route");

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({ message: "这道数学题怎么做？" })
      })
    );

    const body = await response.json();
    expect(body.blocked).toBe(false);
    expect(body.reply).toContain("这道数学题怎么做？");
    expect(prismaMock.mistake.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.tutorMessage.createMany).not.toHaveBeenCalled();
  });

  it("returns a clean error for malformed chat JSON", async () => {
    const { POST } = await import("@/app/api/chat/route");

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: "{not-json"
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "请求格式不正确。" });
    expect(prismaMock.tutorMessage.createMany).not.toHaveBeenCalled();
  });

  it("blocks non-study chat and logs the request", async () => {
    const { POST } = await import("@/app/api/chat/route");

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({ message: "推荐一个游戏" })
      })
    );

    expect(await response.json()).toMatchObject({ blocked: true });
    expect(prismaMock.nonStudyRequestLog.create).toHaveBeenCalledWith({
      data: {
        studentId: "default-student",
        contentSummary: "推荐一个游戏",
        category: "game"
      }
    });
  });

  it("lists mistakes with optional subject and grade filters", async () => {
    prismaMock.mistake.findMany.mockResolvedValue([{ id: "mistake-1" }]);
    const { GET } = await import("@/app/api/mistakes/route");

    const response = await GET(new Request("http://localhost/api/mistakes?subject=数学&grade=八年级"));

    expect(await response.json()).toEqual({ mistakes: [{ id: "mistake-1" }] });
    expect(prismaMock.mistake.findMany).toHaveBeenCalledWith({
      where: { studentId: "default-student", subject: "数学", grade: "八年级", ...activeReviewWhere },
      include: { mistakeArchetypes: { include: { archetype: true } } },
      orderBy: { createdAt: "desc" }
    });
  });

  it("returns a mistake detail by awaited route params", async () => {
    prismaMock.mistake.findFirst.mockResolvedValue({ id: "mistake-1" });
    const { GET } = await import("@/app/api/mistakes/[id]/route");

    const response = await GET(new Request("http://localhost/api/mistakes/mistake-1"), {
      params: Promise.resolve({ id: "mistake-1" })
    });

    expect(await response.json()).toEqual({ mistake: { id: "mistake-1" } });
    expect(prismaMock.mistake.findFirst).toHaveBeenCalledWith({
      where: { id: "mistake-1", studentId: "default-student", ...activeReviewWhere },
      include: {
        tutorMessages: { orderBy: { createdAt: "asc" } },
        mistakeArchetypes: { include: { archetype: true } }
      }
    });
  });

  it("returns analysis and chat history for the tutor home page", async () => {
    prismaMock.mistake.findMany.mockResolvedValue([
      {
        id: "mistake-1",
        imagePath: "uploads/paper.png",
        subject: "数学",
        grade: "七年级",
        questionType: "解答题",
        recognizedText: "2x + 3 = 7",
        studentAnswer: "x=3",
        correctAnswer: "x=2",
        explanation: "先移项再除以系数。",
        mistakeReason: "移项规则不熟。",
        masteryStatus: "new",
        createdAt: new Date("2026-07-01T08:00:00.000Z"),
        updatedAt: new Date("2026-07-01T08:00:00.000Z"),
        tutorMessages: [
          { id: "msg-1", role: "assistant", content: "先移项再除以系数。", createdAt: new Date("2026-07-01T08:00:00.000Z") },
          { id: "msg-2", role: "user", content: "为什么要减 3？", createdAt: new Date("2026-07-01T08:01:00.000Z") }
        ],
        mistakeArchetypes: [
          {
            archetype: {
              title: "一元一次方程",
              pattern: "ax+b=c",
              solutionTemplate: "移项，合并，系数化 1",
              commonTraps: "[\"移项忘记变号\"]"
            }
          }
        ]
      }
    ]);
    const { GET } = await import("@/app/api/history/route");

    const response = await GET();

    await expect(response.json()).resolves.toMatchObject({
      history: [
        {
          mistakeId: "mistake-1",
          analysis: {
            subject: "数学",
            grade: "七年级",
            questionType: "解答题",
            archetype: { commonTraps: ["移项忘记变号"] }
          },
          uploadedImages: [{ index: 0, filename: "paper.png", url: "/api/uploads/paper.png" }],
          messages: [
            { role: "assistant", content: "先移项再除以系数。" },
            { role: "user", content: "为什么要减 3？" }
          ]
        }
      ]
    });
    expect(prismaMock.mistake.findMany).toHaveBeenCalledWith({
      where: { studentId: "default-student", ...activeReviewWhere },
      include: {
        tutorMessages: { orderBy: { createdAt: "asc" } },
        mistakeArchetypes: { include: { archetype: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 20
    });
  });

  it("orders knowledge gaps by severity rank and recency", async () => {
    prismaMock.knowledgeGap.findMany.mockResolvedValue([{ id: "gap-1" }]);
    const { GET } = await import("@/app/api/knowledge-gaps/route");

    const response = await GET();

    expect(await response.json()).toEqual({ gaps: [{ id: "gap-1" }] });
    expect(prismaMock.knowledgeGap.findMany).toHaveBeenCalledWith({
      where: {
        studentId: "default-student",
        knowledgePoint: {
          archetypes: {
            some: {
              mistakeArchetypes: {
                some: {
                  mistake: { studentId: "default-student", ...activeReviewWhere }
                }
              }
            }
          }
        }
      },
      include: { knowledgePoint: true },
      orderBy: [{ severityRank: "desc" }, { lastOccurredAt: "desc" }]
    });
  });

  it("builds the filtered knowledge tree", async () => {
    prismaMock.knowledgePoint.findMany.mockResolvedValue([
      { id: "point-1", name: "一次函数", parentId: null, chapter: "函数", sortOrder: 1 }
    ]);
    prismaMock.knowledgeGap.findMany.mockResolvedValue([
      { knowledgePointId: "point-1", severity: "weak", errorCount: 2, repeatedArchetypeCount: 1 }
    ]);
    const { GET } = await import("@/app/api/knowledge-tree/route");

    const response = await GET(new Request("http://localhost/api/knowledge-tree?subject=数学&grade=八年级"));

    expect(await response.json()).toMatchObject({
      grade: "八年级",
      subject: "数学",
      tree: [{ id: "point-1", severity: "weak", errorCount: 2 }]
    });
    expect(prismaMock.knowledgePoint.findMany).toHaveBeenCalledWith({
      where: { grade: "八年级", subject: "数学" },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
    });
    expect(prismaMock.knowledgeGap.findMany).toHaveBeenCalledWith({
      where: {
        studentId: "default-student",
        knowledgePoint: {
          grade: "八年级",
          subject: "数学",
          archetypes: {
            some: {
              mistakeArchetypes: {
                some: {
                  mistake: { studentId: "default-student", ...activeReviewWhere }
                }
              }
            }
          }
        }
      }
    });
  });

  it("returns a knowledge point drill-down detail with examples and related mistakes", async () => {
    prismaMock.knowledgePoint.findFirst.mockResolvedValue({
      id: "point-1",
      subject: "数学",
      grade: "八年级",
      name: "一次函数图像与性质",
      chapter: "函数",
      parentId: null,
      parent: null,
      children: [{ id: "point-child", name: "一次函数与坐标轴交点", chapter: "函数", sortOrder: 2 }]
    });
    prismaMock.knowledgeGap.findFirst.mockResolvedValue({
      id: "gap-1",
      knowledgePointId: "point-1",
      severity: "repeated_archetype",
      errorCount: 3,
      repeatedArchetypeCount: 2,
      reviewSuggestion: "优先复习图像与 k、b 的关系。",
      typicalReasons: "[\"把 k 和 b 混淆\"]"
    });
    prismaMock.archetype.findMany.mockResolvedValue([
      {
        id: "arch-1",
        title: "一次函数图像性质判断母题",
        pattern: "判断一次函数图像",
        solutionTemplate: "先看 k 决定升降，再看 b 决定与 y 轴交点。",
        commonTraps: "[\"只看截距\", \"忽略斜率正负\"]",
        mistakeArchetypes: [
          {
            mistake: {
              id: "mistake-1",
              subject: "数学",
              grade: "八年级",
              questionType: "选择题",
              recognizedText: "一次函数 y=-2x+3 的图像经过哪些象限？",
              studentAnswer: "一二三",
              correctAnswer: "一二四",
              explanation: "k<0 图像下降，b>0 过 y 轴正半轴。",
              mistakeReason: "忽略斜率为负。",
              masteryStatus: "new",
              createdAt: new Date("2026-07-01T08:00:00.000Z")
            }
          }
        ]
      }
    ]);
    const { GET } = await import("@/app/api/knowledge-points/[id]/route");

    const response = await GET(new Request("http://localhost/api/knowledge-points/point-1"), {
      params: Promise.resolve({ id: "point-1" })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      detail: {
        knowledgePoint: { id: "point-1", name: "一次函数图像与性质" },
        gap: { severity: "repeated_archetype", errorCount: 3 },
        richExplanation: {
          diagnosis: expect.stringContaining("一次函数图像与性质"),
          illustration: { type: "treePath" },
          shenzhenExample: {
            label: "深圳题型风格",
            question: expect.stringContaining("一次函数")
          }
        },
        archetypes: [{ title: "一次函数图像性质判断母题" }],
        relatedMistakes: [{ id: "mistake-1", correctAnswer: "一二四" }]
      }
    });
    expect(prismaMock.knowledgePoint.findFirst).toHaveBeenCalledWith({
      where: { id: "point-1" },
      include: {
        parent: true,
        children: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }
      }
    });
  });
});
