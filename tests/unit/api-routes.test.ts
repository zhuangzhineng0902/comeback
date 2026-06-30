import { mkdir, readdir, rm } from "node:fs/promises";
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
const prismaMock = {
  mistake: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn()
  },
  knowledgeGap: {
    findMany: vi.fn()
  },
  knowledgePoint: {
    findMany: vi.fn()
  },
  nonStudyRequestLog: {
    create: vi.fn()
  },
  tutorMessage: {
    createMany: vi.fn()
  }
};

vi.mock("@/lib/analyzer", () => ({
  analyzeMistake: analyzeMistakeMock
}));

vi.mock("@/lib/repositories/mistakes", () => ({
  saveAnalysisAsMistake: saveAnalysisAsMistakeMock
}));

vi.mock("@/lib/db", () => ({
  prisma: prismaMock
}));

describe("api routes", () => {
  beforeEach(() => {
    analyzeMistakeMock.mockReset();
    saveAnalysisAsMistakeMock.mockReset();
    prismaMock.mistake.findFirst.mockReset();
    prismaMock.mistake.findMany.mockReset();
    prismaMock.mistake.findUnique.mockReset();
    prismaMock.knowledgeGap.findMany.mockReset();
    prismaMock.knowledgePoint.findMany.mockReset();
    prismaMock.nonStudyRequestLog.create.mockReset();
    prismaMock.tutorMessage.createMany.mockReset();
  });

  afterEach(async () => {
    await rm(path.join(process.cwd(), "uploads"), { recursive: true, force: true });
    await mkdir(path.join(process.cwd(), "uploads"), { recursive: true });
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
      gradeHint: "八年级"
    });
    expect(saveAnalysisAsMistakeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: "default-student",
        imagePath: expect.stringMatching(/^uploads\/[0-9a-f-]+-paper_photo\.png$/),
        analysis
      })
    );
  });

  it("analyzes up to sixteen uploaded images without subject or grade hints", async () => {
    const secondAnalysis = { ...analysis, questionType: "第二道选择题", mistakeReason: "第二题错因" };
    analyzeMistakeMock.mockResolvedValue({ mode: "api", analysis, analyses: [analysis, secondAnalysis] });
    saveAnalysisAsMistakeMock.mockResolvedValue({
      mistake: { id: "mistake-1" },
      gap: { severity: "important" }
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

    expect(await response.json()).toMatchObject({
      mode: "api",
      mistakeId: "mistake-1",
      analyses: [{ questionType: "选择题" }, { questionType: "第二道选择题" }],
      savedMistakes: [
        { mistakeId: "mistake-1", gapSeverity: "important" },
        { mistakeId: "mistake-1", gapSeverity: "important" }
      ]
    });
    expect(analyzeMistakeMock).toHaveBeenCalledWith({
      filename: "page-1.png, page-2.png",
      mimeType: "image/png",
      imageBase64: Buffer.from("image-1").toString("base64"),
      images: [
        { filename: "page-1.png", mimeType: "image/png", imageBase64: Buffer.from("image-1").toString("base64") },
        { filename: "page-2.png", mimeType: "image/png", imageBase64: Buffer.from("image-2").toString("base64") }
      ],
      subjectHint: undefined,
      gradeHint: undefined
    });
    expect(saveAnalysisAsMistakeMock).toHaveBeenCalledTimes(2);
    expect(saveAnalysisAsMistakeMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        imagePath: expect.stringMatching(/^uploads\/[0-9a-f-]+-page-1\.png$/),
        analysis
      })
    );
    expect(saveAnalysisAsMistakeMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        imagePath: expect.stringMatching(/^uploads\/[0-9a-f-]+-page-1\.png$/),
        analysis: secondAnalysis
      })
    );
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
    const files = await readdir(path.join(process.cwd(), "uploads"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "分析失败，请稍后重试。" });
    expect(files).toEqual([]);
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
      where: { id: "mistake-1", studentId: "default-student" }
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
      where: { id: "missing-mistake", studentId: "default-student" }
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
      where: { studentId: "default-student", subject: "数学", grade: "八年级" },
      include: { mistakeArchetypes: { include: { archetype: true } } },
      orderBy: { createdAt: "desc" }
    });
  });

  it("returns a mistake detail by awaited route params", async () => {
    prismaMock.mistake.findUnique.mockResolvedValue({ id: "mistake-1" });
    const { GET } = await import("@/app/api/mistakes/[id]/route");

    const response = await GET(new Request("http://localhost/api/mistakes/mistake-1"), {
      params: Promise.resolve({ id: "mistake-1" })
    });

    expect(await response.json()).toEqual({ mistake: { id: "mistake-1" } });
    expect(prismaMock.mistake.findUnique).toHaveBeenCalledWith({
      where: { id: "mistake-1" },
      include: {
        tutorMessages: { orderBy: { createdAt: "asc" } },
        mistakeArchetypes: { include: { archetype: true } }
      }
    });
  });

  it("orders knowledge gaps by severity rank and recency", async () => {
    prismaMock.knowledgeGap.findMany.mockResolvedValue([{ id: "gap-1" }]);
    const { GET } = await import("@/app/api/knowledge-gaps/route");

    const response = await GET();

    expect(await response.json()).toEqual({ gaps: [{ id: "gap-1" }] });
    expect(prismaMock.knowledgeGap.findMany).toHaveBeenCalledWith({
      where: { studentId: "default-student" },
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
        knowledgePoint: { grade: "八年级", subject: "数学" }
      }
    });
  });
});
