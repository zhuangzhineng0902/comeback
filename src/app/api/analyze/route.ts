import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { triggerAnalysisWorker } from "@/lib/analysis/jobs";
import { analyzeMistake } from "@/lib/analyzer";
import { analyzeWithSimulation } from "@/lib/analyzer/simulated";
import { prisma } from "@/lib/db";
import { analyzeImageWithOcr } from "@/lib/ocr/client";
import { saveAnalysisAsMistake } from "@/lib/repositories/mistakes";
import { grades, subjects, type AnalysisOutput, type Grade, type PaperVisionContext, type Subject } from "@/lib/types";

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const maxUploadBytes = 8 * 1024 * 1024;
const maxUploadFiles = 16;
const defaultAnalysisImageMaxDimension = 1600;
const defaultAnalysisImageQuality = 75;
const execFileAsync = promisify(execFile);

type UploadedImage = {
  filename: string;
  safeName: string;
  mimeType: string;
  imageBase64: string;
  imagePath: string;
  absoluteImagePath: string;
  analysisMimeType: string;
  analysisImageBase64: string;
  analysisAbsoluteImagePath?: string;
};

async function convertHeicToJpeg(inputPath: string, outputPath: string) {
  try {
    await execFileAsync("sips", ["-s", "format", "jpeg", inputPath, "--out", outputPath]);
  } catch (error) {
    throw new Error(`HEIC 图片转换失败，请改用 JPG、PNG 或 WebP 后重新上传。${error instanceof Error ? ` ${error.message}` : ""}`);
  }
}

function getAnalysisImageMaxDimension() {
  const configured = Number.parseInt(process.env.ANALYSIS_IMAGE_MAX_DIMENSION ?? "", 10);
  return Number.isFinite(configured) && configured > 0 ? configured : defaultAnalysisImageMaxDimension;
}

function getAnalysisImageQuality() {
  const configured = Number.parseInt(process.env.ANALYSIS_IMAGE_QUALITY ?? "", 10);
  return Number.isFinite(configured) && configured > 0 ? Math.min(configured, 100) : defaultAnalysisImageQuality;
}

async function optimizeImageForAnalysis(inputPath: string, outputPath: string) {
  await execFileAsync("sips", [
    "-s",
    "format",
    "jpeg",
    "-s",
    "formatOptions",
    String(getAnalysisImageQuality()),
    "-Z",
    String(getAnalysisImageMaxDimension()),
    inputPath,
    "--out",
    outputPath
  ]);
}

function isMiniMaxFailure(error: unknown) {
  return error instanceof Error && error.message.includes("MiniMax");
}

function shouldFallbackToSimulation() {
  return process.env.ENABLE_AI_FALLBACK === "true";
}

function getAnalyzeImageConcurrency() {
  const configured = Number.parseInt(process.env.ANALYZE_IMAGE_CONCURRENCY ?? "", 10);
  return Number.isFinite(configured) && configured > 0 ? Math.min(configured, maxUploadFiles) : 4;
}

function getOcrImageConcurrency() {
  const configured = Number.parseInt(process.env.OCR_IMAGE_CONCURRENCY ?? "", 10);
  return Number.isFinite(configured) && configured > 0 ? Math.min(configured, maxUploadFiles) : 2;
}

function isPaperVisionContext(context: PaperVisionContext | null | undefined): context is PaperVisionContext {
  return context !== null && context !== undefined;
}

async function analyzeWithFallback(input: Parameters<typeof analyzeMistake>[0]) {
  return analyzeMistake(input).catch(async (error) => {
    if (!isMiniMaxFailure(error)) {
      throw error;
    }

    if (!shouldFallbackToSimulation()) {
      throw error;
    }

    console.error("MiniMax analysis failed; falling back to simulation", error);
    const analysis = await analyzeWithSimulation(input);
    return { mode: "simulation" as const, analysis, analyses: [analysis] };
  });
}

function withSourceImageIndex(analysis: AnalysisOutput, sourceImageIndex: number) {
  return {
    ...analysis,
    sourceImageIndex
  };
}

function inferFallbackSubject(image: UploadedImage, contexts: PaperVisionContext[]): Subject {
  const text = [image.filename, ...contexts.map((context) => context.rawText ?? "")].join("\n");
  if (/[A-Za-z]{3,}|英语|English/i.test(text)) return "英语";
  if (/数学|函数|方程|几何|代数/.test(text)) return "数学";
  if (/语文|阅读|作文|古诗|文言/.test(text)) return "语文";
  if (/物理|电路|速度|压强|力/.test(text)) return "物理";
  if (/化学|溶液|元素|反应|方程式/.test(text)) return "化学";
  return "英语";
}

function buildFailedBatchAnalysis(input: {
  image: UploadedImage;
  sourceImageIndex: number;
  paperVisionContexts: PaperVisionContext[];
  subjectHint?: Subject;
  gradeHint?: Grade;
  error: unknown;
}): AnalysisOutput {
  const firstContext = input.paperVisionContexts[0];
  const firstCandidate = firstContext?.mistakeCandidates?.[0];
  const subject = input.subjectHint ?? inferFallbackSubject(input.image, input.paperVisionContexts);
  const grade = input.gradeHint ?? "七年级";
  const errorSummary = input.error instanceof Error ? input.error.message : String(input.error);
  const recognizedText =
    firstCandidate?.text ??
    firstContext?.rawText?.slice(0, 500) ??
    "这一页 AI 深度解析失败，已保留图片和 OCR 信息，建议稍后单独重试这一页。";

  return {
    sourceImageIndex: input.sourceImageIndex,
    subject,
    grade,
    questionType: "批量分析待复核页",
    recognizedText,
    studentAnswer: "AI 未能稳定解析这一页的学生答案。",
    correctAnswer: "需要稍后单独重试或人工复核。",
    knowledgePoints: [{ name: "待复核知识点", confidence: 0.3 }],
    mistakeReason: `批量分析中这一页解析失败：${errorSummary.slice(0, 180)}`,
    studentFriendlyExplanation: "这一页已经保存下来，但 AI 深度讲解没有稳定生成。可以先复习其它已解析错题，再单独上传这一页重试。",
    example: "把这一页单独上传，或裁剪到错题区域后重新分析。",
    archetype: {
      title: "批量分析失败页复核",
      pattern: "整页试卷批量识别时，单页模型输出异常",
      solutionTemplate: "先确认图片清晰度，再单页重试；若有 OCR 候选，优先核对候选题号。",
      commonTraps: ["一次上传页数较多导致模型输出截断", "图片内容过密导致 JSON 输出不完整"]
    },
    practiceQuestions: [
      {
        question: "请把这一页中最不确定的一道错题单独拍清楚后再提交。",
        answer: "以重新分析后的答案为准。",
        hint: "单页或裁剪错题区域能显著提高稳定性。"
      }
    ],
    gradingEvidence: {
      markType: firstCandidate?.markTypes?.[0] ?? "unknown",
      teacherMarkConfidence: firstCandidate?.confidence ?? 0,
      answerMatchConfidence: 0,
      judgement: "suspected",
      isPartialCredit: false,
      needsConfirmation: true,
      evidenceSummary: firstCandidate?.evidenceSummary ?? "批量分析中这一页 AI 输出异常，已保存为待复核记录。",
      studentAnswerLocation: firstCandidate?.bbox ? `OCR候选区域 [${firstCandidate.bbox.join(",")}]` : undefined
    }
  };
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const files = [
    ...formData.getAll("files"),
    ...formData.getAll("file")
  ].filter((value): value is File => value instanceof File);
  const subjectHint = formData.get("subjectHint");
  const gradeHint = formData.get("gradeHint");

  if (files.length === 0) {
    return NextResponse.json({ error: "请先上传至少一张试卷或习题照片。" }, { status: 400 });
  }

  if (files.length > maxUploadFiles) {
    return NextResponse.json({ error: "一次最多上传 16 张图片。" }, { status: 400 });
  }

  if (files.some((file) => !allowedImageTypes.has(file.type))) {
    return NextResponse.json({ error: "请上传 JPG、PNG、WebP 或 HEIC 格式的图片。" }, { status: 400 });
  }

  if (files.some((file) => file.size > maxUploadBytes)) {
    return NextResponse.json({ error: "单张图片不能超过 8MB，请压缩后再上传。" }, { status: 400 });
  }

  const subject = subjects.includes(subjectHint as Subject) ? (subjectHint as Subject) : undefined;
  const grade = grades.includes(gradeHint as Grade) ? (gradeHint as Grade) : undefined;

  const uploadDir = path.join(process.cwd(), "uploads");
  await mkdir(uploadDir, { recursive: true });
  const uploadedImages: UploadedImage[] = [];

  for (const file of files) {
    const bytes = Buffer.from(await file.arrayBuffer());
    const safeName = `${randomUUID()}-${file.name.replace(/[^a-zA-Z0-9_.-]/g, "_")}`;
    const imagePath = path.join("uploads", safeName);
    const absoluteImagePath = path.join(process.cwd(), imagePath);
    await writeFile(absoluteImagePath, bytes);
    const needsConversion = file.type === "image/heic" || file.type === "image/heif";
    const shouldCreateAnalysisImage = needsConversion || process.env.NODE_ENV !== "test";
    const analysisAbsoluteImagePath = shouldCreateAnalysisImage
      ? path.join(uploadDir, `${path.parse(safeName).name}-analysis.jpg`)
      : undefined;
    let analysisBytes = bytes;
    let analysisMimeType = file.type;

    if (analysisAbsoluteImagePath) {
      try {
        if (needsConversion && process.env.NODE_ENV === "test") {
          await convertHeicToJpeg(absoluteImagePath, analysisAbsoluteImagePath);
        } else {
          await optimizeImageForAnalysis(absoluteImagePath, analysisAbsoluteImagePath);
        }
        analysisBytes = await readFile(analysisAbsoluteImagePath);
        analysisMimeType = "image/jpeg";
      } catch (error) {
        if (needsConversion) {
          throw new Error(`HEIC 图片转换失败，请改用 JPG、PNG 或 WebP 后重新上传。${error instanceof Error ? ` ${error.message}` : ""}`);
        }
        console.warn("Image optimization for AI analysis failed; using original upload.", error);
      }
    }

    uploadedImages.push({
      filename: file.name,
      safeName,
      mimeType: file.type,
      imageBase64: bytes.toString("base64"),
      imagePath,
      absoluteImagePath,
      analysisMimeType,
      analysisImageBase64: analysisBytes.toString("base64"),
      analysisAbsoluteImagePath
    });
  }

  if (uploadedImages.length > 1) {
    const batch = await prisma.analysisBatch.create({
      data: {
        studentId: "default-student",
        status: "queued",
        total: uploadedImages.length,
        jobs: {
          create: uploadedImages.map((image, index) => ({
            studentId: "default-student",
            imageIndex: index,
            filename: image.filename,
            imagePath: image.imagePath,
            analysisImagePath: image.analysisAbsoluteImagePath
              ? path.relative(process.cwd(), image.analysisAbsoluteImagePath)
              : null,
            analysisMimeType: image.analysisMimeType,
            subjectHint: subject ?? null,
            gradeHint: grade ?? null,
            status: "queued"
          }))
        }
      },
      include: { jobs: { orderBy: { imageIndex: "asc" } } }
    });

    triggerAnalysisWorker();

    return NextResponse.json(
      {
        mode: "queued",
        batch: {
          id: batch.id,
          status: batch.status,
          total: batch.total,
          completed: 0,
          succeeded: 0,
          failed: 0,
          createdAt: batch.createdAt.toISOString(),
          updatedAt: batch.updatedAt.toISOString()
        },
        jobs: batch.jobs.map((job) => ({
          id: job.id,
          imageIndex: job.imageIndex,
          filename: job.filename,
          status: job.status,
          retryCount: job.retryCount,
          image: {
            index: job.imageIndex,
            filename: job.filename,
            url: `/api/uploads/${encodeURIComponent(path.basename(job.imagePath))}`
          },
          analyses: [],
          savedMistakes: []
        }))
      },
      { status: 202 }
    );
  }

  try {
    const firstImage = uploadedImages[0];
    const paperVisionContexts = (
      await mapWithConcurrency(
        uploadedImages,
        getOcrImageConcurrency(),
        (image, index) =>
          analyzeImageWithOcr({
            filename: image.filename,
            mimeType: image.analysisMimeType,
            imageBase64: image.analysisImageBase64,
            sourceImageIndex: index
          })
      )
    ).filter(isPaperVisionContext);
    const analyzeInput = {
      filename: uploadedImages.map((image) => image.filename).join(", "),
      mimeType: firstImage.analysisMimeType,
      imageBase64: firstImage.analysisImageBase64,
      images: uploadedImages.map((image) => ({
        filename: image.filename,
        mimeType: image.analysisMimeType,
        imageBase64: image.analysisImageBase64
      })),
      paperVisionContexts: paperVisionContexts.length > 0 ? paperVisionContexts : undefined,
      subjectHint: subject,
      gradeHint: grade
    };
    const results = uploadedImages.length === 1
      ? [await analyzeWithFallback(analyzeInput)]
      : await mapWithConcurrency(
          uploadedImages,
          getAnalyzeImageConcurrency(),
          async (image, index) => {
            const imagePaperVisionContexts = paperVisionContexts.filter((context) => context.sourceImageIndex === index);
            const singleImageInput = {
              filename: image.filename,
              mimeType: image.analysisMimeType,
              imageBase64: image.analysisImageBase64,
              images: [
                {
                  filename: image.filename,
                  mimeType: image.analysisMimeType,
                  imageBase64: image.analysisImageBase64
                }
              ],
              paperVisionContexts: imagePaperVisionContexts,
              subjectHint: subject,
              gradeHint: grade,
              analysisDetail: "compact" as const
            };
            try {
              return await analyzeWithFallback(singleImageInput);
            } catch (error) {
              console.error(`Batch image analysis failed for ${image.filename}; keeping batch response alive.`, error);
              const analysis = buildFailedBatchAnalysis({
                image,
                sourceImageIndex: index,
                paperVisionContexts: imagePaperVisionContexts,
                subjectHint: subject,
                gradeHint: grade,
                error
              });
              return { mode: "partial_failure" as const, analysis, analyses: [analysis] };
            }
          }
        );
    const analyses = results.flatMap((result, resultIndex) =>
      (result.analyses ?? [result.analysis]).map((analysis) =>
        uploadedImages.length === 1 ? analysis : withSourceImageIndex(analysis, resultIndex)
      )
    );
    const resultMode = results.some((result) => result.mode === "api") ? "api" : "simulation";
    const imageSummaries = uploadedImages.map((image, index) => ({
      index,
      filename: image.filename,
      url: `/api/uploads/${encodeURIComponent(image.safeName)}`
    }));
    const savedMistakes: Array<{ mistakeId: string; gapSeverity: string }> = [];
    for (const analysis of analyses) {
      const sourceImageIndex =
        typeof analysis.sourceImageIndex === "number" &&
        analysis.sourceImageIndex >= 0 &&
        analysis.sourceImageIndex < uploadedImages.length
          ? analysis.sourceImageIndex
          : 0;
      const sourceImage = uploadedImages[sourceImageIndex] ?? firstImage;
      const saved = await saveAnalysisAsMistake({
        studentId: "default-student",
        imagePath: sourceImage.imagePath,
        analysis
      });

      savedMistakes.push({
        mistakeId: saved.mistake.id,
        gapSeverity: saved.gap.severity
      });
    }
    const firstSaved = savedMistakes[0];
    const imageGroups = imageSummaries.map((image) => ({
      image,
      paperVisionContext: paperVisionContexts.find((context) => context.sourceImageIndex === image.index),
      analyses: [] as typeof analyses,
      savedMistakes: [] as typeof savedMistakes
    }));

    analyses.forEach((analysis, index) => {
      const sourceImageIndex =
        typeof analysis.sourceImageIndex === "number" &&
        analysis.sourceImageIndex >= 0 &&
        analysis.sourceImageIndex < imageGroups.length
          ? analysis.sourceImageIndex
          : 0;
      imageGroups[sourceImageIndex].analyses.push(analysis);
      imageGroups[sourceImageIndex].savedMistakes.push(savedMistakes[index]);
    });

    return NextResponse.json({
      mode: resultMode,
      analysis: analyses[0],
      analyses,
      mistakeId: firstSaved.mistakeId,
      gapSeverity: firstSaved.gapSeverity,
      savedMistakes,
      uploadedImages: imageSummaries,
      paperVisionContexts,
      imageGroups
    });
  } catch (error) {
    console.error("Analyze API failed", error);
    await Promise.all(
      uploadedImages.flatMap((image) => [
        unlink(image.absoluteImagePath).catch(() => undefined),
        image.analysisAbsoluteImagePath ? unlink(image.analysisAbsoluteImagePath).catch(() => undefined) : Promise.resolve()
      ])
    );
    const message = isMiniMaxFailure(error)
      ? "真实 AI 分析失败，请稍后重试。"
      : "分析失败，请稍后重试。";
    const detail = process.env.NODE_ENV === "development" && error instanceof Error ? error.message : undefined;
    return NextResponse.json({ error: message, detail }, { status: 500 });
  }
}
