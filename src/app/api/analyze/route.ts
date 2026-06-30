import { mkdir, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { NextResponse } from "next/server";
import { analyzeMistake } from "@/lib/analyzer";
import { saveAnalysisAsMistake } from "@/lib/repositories/mistakes";
import { grades, subjects, type Grade, type Subject } from "@/lib/types";

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const maxUploadBytes = 8 * 1024 * 1024;
const maxUploadFiles = 16;

type UploadedImage = {
  filename: string;
  safeName: string;
  mimeType: string;
  imageBase64: string;
  imagePath: string;
  absoluteImagePath: string;
};

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
    uploadedImages.push({
      filename: file.name,
      safeName,
      mimeType: file.type,
      imageBase64: bytes.toString("base64"),
      imagePath,
      absoluteImagePath
    });
  }

  try {
    const firstImage = uploadedImages[0];
    const result = await analyzeMistake({
      filename: uploadedImages.map((image) => image.filename).join(", "),
      mimeType: firstImage.mimeType,
      imageBase64: firstImage.imageBase64,
      images: uploadedImages.map((image) => ({
        filename: image.filename,
        mimeType: image.mimeType,
        imageBase64: image.imageBase64
      })),
      subjectHint: subject,
      gradeHint: grade
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
      imageGroups
    });
  } catch (error) {
    await Promise.all(uploadedImages.map((image) => unlink(image.absoluteImagePath).catch(() => undefined)));
    const message = error instanceof Error && error.message.includes("MiniMax")
      ? "真实 AI 分析失败，请稍后重试。"
      : "分析失败，请稍后重试。";
    const detail = process.env.NODE_ENV === "development" && error instanceof Error ? error.message : undefined;
    return NextResponse.json({ error: message, detail }, { status: 500 });
  }
}
