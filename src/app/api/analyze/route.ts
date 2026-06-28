import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { analyzeMistake } from "@/lib/analyzer";
import { saveAnalysisAsMistake } from "@/lib/repositories/mistakes";
import { grades, subjects, type Grade, type Subject } from "@/lib/types";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");
  const subjectHint = formData.get("subjectHint");
  const gradeHint = formData.get("gradeHint");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "请先上传一张试卷或习题照片。" }, { status: 400 });
  }

  const subject = subjects.includes(subjectHint as Subject) ? (subjectHint as Subject) : undefined;
  const grade = grades.includes(gradeHint as Grade) ? (gradeHint as Grade) : undefined;

  const bytes = Buffer.from(await file.arrayBuffer());
  const uploadDir = path.join(process.cwd(), "uploads");
  await mkdir(uploadDir, { recursive: true });
  const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9_.-]/g, "_")}`;
  const imagePath = path.join("uploads", safeName);
  await writeFile(path.join(process.cwd(), imagePath), bytes);

  const result = await analyzeMistake({ filename: file.name, subjectHint: subject, gradeHint: grade });
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
}
