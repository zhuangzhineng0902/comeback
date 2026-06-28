import { mkdir, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { NextResponse } from "next/server";
import { analyzeMistake } from "@/lib/analyzer";
import { saveAnalysisAsMistake } from "@/lib/repositories/mistakes";
import { grades, subjects, type Grade, type Subject } from "@/lib/types";

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const maxUploadBytes = 8 * 1024 * 1024;

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");
  const subjectHint = formData.get("subjectHint");
  const gradeHint = formData.get("gradeHint");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "请先上传一张试卷或习题照片。" }, { status: 400 });
  }

  if (!allowedImageTypes.has(file.type)) {
    return NextResponse.json({ error: "请上传 JPG、PNG、WebP 或 HEIC 格式的图片。" }, { status: 400 });
  }

  if (file.size > maxUploadBytes) {
    return NextResponse.json({ error: "图片不能超过 8MB，请压缩后再上传。" }, { status: 400 });
  }

  const subject = subjects.includes(subjectHint as Subject) ? (subjectHint as Subject) : undefined;
  const grade = grades.includes(gradeHint as Grade) ? (gradeHint as Grade) : undefined;

  const bytes = Buffer.from(await file.arrayBuffer());
  const uploadDir = path.join(process.cwd(), "uploads");
  await mkdir(uploadDir, { recursive: true });
  const safeName = `${randomUUID()}-${file.name.replace(/[^a-zA-Z0-9_.-]/g, "_")}`;
  const imagePath = path.join("uploads", safeName);
  const absoluteImagePath = path.join(process.cwd(), imagePath);
  await writeFile(absoluteImagePath, bytes);

  try {
    const result = await analyzeMistake({
      filename: file.name,
      mimeType: file.type,
      imageBase64: bytes.toString("base64"),
      subjectHint: subject,
      gradeHint: grade
    });
    const saved = await saveAnalysisAsMistake({
      studentId: "default-student",
      imagePath,
      analysis: result.analysis
    });

    return NextResponse.json({
      mode: result.mode,
      analysis: result.analysis,
      mistakeId: saved.mistake.id,
      gapSeverity: saved.gap.severity
    });
  } catch {
    await unlink(absoluteImagePath).catch(() => undefined);
    return NextResponse.json({ error: "分析失败，请稍后重试。" }, { status: 500 });
  }
}
