import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import type { AnalysisOutput } from "@/lib/types";
import { resolveStoredUploadPath } from "@/lib/uploads";

const STUDENT_ID = "default-student";

function parseJsonArray<T>(value: string | null | undefined): T[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function imageUrl(imagePath: string) {
  return `/api/uploads/${encodeURIComponent(path.basename(imagePath))}`;
}

function displayFilename(imagePath: string) {
  return path.basename(imagePath).replace(/^[0-9a-f-]{36}-/i, "");
}

function jobStatus(input: {
  status: string;
  analysesCount: number;
  savedCount: number;
  needsReviewCount: number;
  retryCount: number;
}) {
  if ((input.status === "queued" || input.status === "processing") && input.retryCount > 0) {
    return { status: "rerunning", label: "重跑中" };
  }
  if (input.status === "failed") {
    return { status: "failed", label: "AI 未解析成功" };
  }
  if (input.status === "queued" || input.status === "processing") {
    return { status: input.status, label: input.status === "queued" ? "排队中" : "解析中" };
  }
  if (input.needsReviewCount > 0) {
    return { status: "needs_review", label: "待人工复核" };
  }
  if (input.analysesCount === 0 || input.savedCount === 0) {
    return { status: "incomplete", label: "未完全解析" };
  }
  return { status: "succeeded", label: "已解析" };
}

async function imageDedupKey(imagePath: string) {
  try {
    const bytes = await readFile(resolveStoredUploadPath(imagePath));
    return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  } catch {
    return `path:${imagePath}`;
  }
}

export async function GET() {
  const [jobs, mistakes] = await Promise.all([
    prisma.analysisJob.findMany({
      where: { studentId: STUDENT_ID },
      include: { batch: { select: { id: true, status: true, total: true, createdAt: true } } },
      orderBy: { createdAt: "desc" }
    }),
    prisma.mistake.findMany({
      where: { studentId: STUDENT_ID },
      select: {
        id: true,
        imagePath: true,
        questionType: true,
        needsManualReview: true,
        reviewStatus: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { createdAt: "desc" }
    })
  ]);

  const jobImagePaths = new Set(jobs.map((job) => job.imagePath));
  const jobUploads = jobs.map((job) => {
    const analyses = parseJsonArray<AnalysisOutput>(job.analysesJson);
    const savedMistakes = parseJsonArray<{ mistakeId: string }>(job.savedMistakesJson);
    const needsReviewCount = analyses.filter((analysis) => analysis.gradingEvidence?.needsConfirmation).length;
    const status = jobStatus({
      status: job.status,
      analysesCount: analyses.length,
      savedCount: savedMistakes.length,
      needsReviewCount,
      retryCount: job.retryCount
    });

    return {
      id: job.id,
      imagePath: job.imagePath,
      kind: "job" as const,
      batchId: job.batchId,
      batchStatus: job.batch.status,
      batchTotal: job.batch.total,
      jobId: job.id,
      filename: job.filename,
      imageUrl: imageUrl(job.imagePath),
      status: status.status,
      statusLabel: status.label,
      parsedMistakeCount: savedMistakes.length,
      needsReviewCount,
      retryCount: job.retryCount,
      errorMessage: job.errorMessage,
      canRetry: status.status !== "rerunning" && job.status !== "queued" && job.status !== "processing",
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      completedAt: job.completedAt?.toISOString() ?? null
    };
  });

  const mistakeGroups = new Map<string, typeof mistakes>();
  for (const mistake of mistakes) {
    if (jobImagePaths.has(mistake.imagePath)) {
      continue;
    }

    const group = mistakeGroups.get(mistake.imagePath) ?? [];
    group.push(mistake);
    mistakeGroups.set(mistake.imagePath, group);
  }

  const singleUploads = Array.from(mistakeGroups.entries()).map(([mistakeImagePath, group]) => {
    const needsReviewCount = group.filter(
      (mistake) => mistake.needsManualReview || mistake.reviewStatus === "pending"
    ).length;
    const first = group[0];
    const latest = group.reduce((current, item) => (item.updatedAt > current.updatedAt ? item : current), first);

    return {
      id: mistakeImagePath,
      imagePath: mistakeImagePath,
      kind: "single" as const,
      batchId: null,
      batchStatus: null,
      batchTotal: 1,
      jobId: null,
      filename: displayFilename(mistakeImagePath),
      imageUrl: imageUrl(mistakeImagePath),
      status: needsReviewCount > 0 ? "needs_review" : "succeeded",
      statusLabel: needsReviewCount > 0 ? "待人工复核" : "已解析",
      parsedMistakeCount: group.length,
      needsReviewCount,
      retryCount: 0,
      errorMessage: null,
      canRetry: true,
      createdAt: first.createdAt.toISOString(),
      updatedAt: latest.updatedAt.toISOString(),
      completedAt: latest.updatedAt.toISOString()
    };
  });

  const uploads = [...jobUploads, ...singleUploads].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );
  const uploadsWithKeys = await Promise.all(
    uploads.map(async (upload) => ({ ...upload, dedupKey: await imageDedupKey(upload.imagePath) }))
  );
  const latestByImage = new Map<string, (typeof uploadsWithKeys)[number]>();
  const rerunningImages = new Set<string>();

  for (const upload of uploadsWithKeys) {
    if (upload.status === "rerunning") {
      rerunningImages.add(upload.dedupKey);
    }

    const latest = latestByImage.get(upload.dedupKey);
    if (!latest || new Date(upload.updatedAt).getTime() > new Date(latest.updatedAt).getTime()) {
      latestByImage.set(upload.dedupKey, upload);
    }
  }

  const syncedUploads = uploadsWithKeys.map((upload) => {
    const latest = latestByImage.get(upload.dedupKey);
    if (rerunningImages.has(upload.dedupKey)) {
      return {
        ...upload,
        status: "rerunning",
        statusLabel: "重跑中",
        canRetry: false,
        errorMessage: null
      };
    }

    return latest
      ? {
          ...upload,
          status: latest.status,
          statusLabel: latest.statusLabel,
          parsedMistakeCount: latest.parsedMistakeCount,
          needsReviewCount: latest.needsReviewCount,
          errorMessage: latest.errorMessage,
          canRetry: latest.canRetry
        }
      : upload;
  }).map((upload) =>
    Object.fromEntries(Object.entries(upload).filter(([key]) => key !== "imagePath" && key !== "dedupKey"))
  );

  return NextResponse.json({
    uploads: syncedUploads,
    summary: {
      total: syncedUploads.length,
      failed: syncedUploads.filter((upload) => upload.status === "failed").length,
      needsReview: syncedUploads.filter((upload) => upload.status === "needs_review").length,
      incomplete: syncedUploads.filter((upload) => upload.status === "incomplete").length,
      rerunning: syncedUploads.filter((upload) => upload.status === "rerunning").length,
      retryable: syncedUploads.filter((upload) => upload.canRetry).length
    }
  });
}
