import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

import { retryAnalysisJobs, triggerAnalysisWorker } from "@/lib/analysis/jobs";
import { prisma } from "@/lib/db";
import { resolveStoredUploadPath } from "@/lib/uploads";

const STUDENT_ID = "default-student";

function mimeTypeForImagePath(imagePath: string) {
  const extension = path.extname(imagePath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  if (extension === ".heic") return "image/heic";
  if (extension === ".heif") return "image/heif";
  return "image/jpeg";
}

function displayFilename(imagePath: string) {
  return path.basename(imagePath).replace(/^[0-9a-f-]{36}-/i, "");
}

async function imageDedupKey(imagePath: string) {
  try {
    const bytes = await readFile(resolveStoredUploadPath(imagePath));
    return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  } catch {
    return `path:${imagePath}`;
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { jobIds?: unknown; uploadIds?: unknown };
  const requestedUploadIds = Array.isArray(body.uploadIds)
    ? body.uploadIds.filter((item): item is string => typeof item === "string" && item.length > 0)
    : undefined;
  const requestedJobIds = Array.isArray(body.jobIds)
    ? body.jobIds.filter((item): item is string => typeof item === "string" && item.length > 0)
    : undefined;
  const requestedIds = requestedUploadIds ?? requestedJobIds;

  const jobs = await prisma.analysisJob.findMany({
    where: {
      studentId: STUDENT_ID,
      NOT: { status: { in: ["queued", "processing"] } },
      ...(requestedIds?.length ? { id: { in: requestedIds } } : {})
    },
    select: { id: true, batchId: true, imagePath: true }
  });

  const seenImageKeys = new Set<string>();
  const uniqueJobs = [];
  for (const job of jobs) {
    const key = await imageDedupKey(job.imagePath);
    if (seenImageKeys.has(key)) {
      continue;
    }
    seenImageKeys.add(key);
    uniqueJobs.push(job);
  }

  const jobsByBatch = new Map<string, string[]>();
  for (const job of uniqueJobs) {
    const ids = jobsByBatch.get(job.batchId) ?? [];
    ids.push(job.id);
    jobsByBatch.set(job.batchId, ids);
  }

  let retried = 0;
  for (const [batchId, jobIds] of jobsByBatch) {
    const result = await retryAnalysisJobs(batchId, jobIds);
    retried += result.retried;
  }

  const jobImagePaths = new Set(
    (await prisma.analysisJob.findMany({
      where: { studentId: STUDENT_ID },
      select: { imagePath: true }
    })).map((job) => job.imagePath)
  );
  const singleMistakes = await prisma.mistake.findMany({
    where: {
      studentId: STUDENT_ID,
      imagePath: {
        notIn: Array.from(jobImagePaths),
        ...(requestedIds?.length ? { in: requestedIds } : {})
      }
    },
    select: { imagePath: true },
    distinct: ["imagePath"]
  });

  const uniqueSingleMistakes = [];
  for (const mistake of singleMistakes) {
    const key = await imageDedupKey(mistake.imagePath);
    if (seenImageKeys.has(key)) {
      continue;
    }
    seenImageKeys.add(key);
    uniqueSingleMistakes.push(mistake);
  }

  if (uniqueSingleMistakes.length > 0) {
    const batch = await prisma.analysisBatch.create({
      data: {
        studentId: STUDENT_ID,
        status: "queued",
        total: uniqueSingleMistakes.length,
        jobs: {
          create: uniqueSingleMistakes.map((mistake, index) => ({
            studentId: STUDENT_ID,
            imageIndex: index,
            filename: displayFilename(mistake.imagePath),
            imagePath: mistake.imagePath,
            analysisImagePath: null,
            analysisMimeType: mimeTypeForImagePath(mistake.imagePath),
            status: "queued",
            retryCount: 1
          }))
        }
      }
    });
    await prisma.analysisBatch.update({
      where: { id: batch.id },
      data: { status: "processing" }
    });
    triggerAnalysisWorker();
    retried += uniqueSingleMistakes.length;
  }

  const skippedDuplicates = jobs.length + singleMistakes.length - uniqueJobs.length - uniqueSingleMistakes.length;
  return NextResponse.json({ retried, skippedDuplicates });
}
