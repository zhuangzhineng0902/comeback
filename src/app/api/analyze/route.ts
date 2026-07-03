import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { analyzeMistake } from "@/lib/analyzer";
import { analyzeWithSimulation } from "@/lib/analyzer/simulated";
import { analyzeImageWithOcr } from "@/lib/ocr/client";
import { saveAnalysisAsMistake } from "@/lib/repositories/mistakes";
import { grades, subjects, type Grade, type PaperVisionContext, type Subject } from "@/lib/types";

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const maxUploadBytes = 8 * 1024 * 1024;
const maxUploadFiles = 16;
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

function isMiniMaxFailure(error: unknown) {
  return error instanceof Error && error.message.includes("MiniMax");
}

function shouldFallbackToSimulation() {
  return process.env.ENABLE_AI_FALLBACK === "true";
}

function isPaperVisionContext(context: PaperVisionContext | null | undefined): context is PaperVisionContext {
  return context !== null && context !== undefined;
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
    const analysisAbsoluteImagePath = needsConversion
      ? path.join(uploadDir, `${path.parse(safeName).name}-analysis.jpg`)
      : undefined;
    let analysisBytes = bytes;
    let analysisMimeType = file.type;

    if (needsConversion && analysisAbsoluteImagePath) {
      await convertHeicToJpeg(absoluteImagePath, analysisAbsoluteImagePath);
      analysisBytes = await readFile(analysisAbsoluteImagePath);
      analysisMimeType = "image/jpeg";
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

  try {
    const firstImage = uploadedImages[0];
    const paperVisionContexts = (
      await Promise.all(
        uploadedImages.map((image, index) =>
          analyzeImageWithOcr({
            filename: image.filename,
            mimeType: image.analysisMimeType,
            imageBase64: image.analysisImageBase64,
            sourceImageIndex: index
          })
        )
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
    const result = await analyzeMistake(analyzeInput).catch(async (error) => {
      if (!isMiniMaxFailure(error)) {
        throw error;
      }

      if (!shouldFallbackToSimulation()) {
        throw error;
      }

      console.error("MiniMax analysis failed; falling back to simulation", error);
      const analysis = await analyzeWithSimulation(analyzeInput);
      return { mode: "simulation" as const, analysis, analyses: [analysis] };
    });
    const analyses = result.analyses ?? [result.analysis];
    const imageSummaries = uploadedImages.map((image, index) => ({
      index,
      filename: image.filename,
      url: `/api/uploads/${encodeURIComponent(image.safeName)}`
    }));
    const savedMistakes = await Promise.all(
      analyses.map(async (analysis) => {
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

        return {
          mistakeId: saved.mistake.id,
          gapSeverity: saved.gap.severity
        };
      })
    );
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
      mode: result.mode,
      analysis: result.analysis,
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
