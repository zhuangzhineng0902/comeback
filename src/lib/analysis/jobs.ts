import { readFile } from "node:fs/promises";
import path from "node:path";

import { analyzeMistake } from "@/lib/analyzer";
import { analyzeWithSimulation, type AnalyzeInput } from "@/lib/analyzer/simulated";
import { prisma } from "@/lib/db";
import { analyzeImageWithOcr } from "@/lib/ocr/client";
import { saveAnalysisAsMistake } from "@/lib/repositories/mistakes";
import type { AnalysisOutput, GapSeverity, Grade, PaperVisionContext, Subject } from "@/lib/types";

const STUDENT_ID = "default-student";
const maxWorkerConcurrency = 4;

type AnalysisMode = "api" | "simulation";
type SavedMistakeSummary = { mistakeId: string; gapSeverity: GapSeverity };

type RunningState = {
  active: boolean;
};

const globalForJobs = globalThis as unknown as { analysisJobWorker?: RunningState };
const runningState = globalForJobs.analysisJobWorker ?? { active: false };
globalForJobs.analysisJobWorker = runningState;

function isMiniMaxFailure(error: unknown) {
  return error instanceof Error && error.message.includes("MiniMax");
}

function shouldFallbackToSimulation() {
  return process.env.ENABLE_AI_FALLBACK === "true";
}

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

function parseJsonObject<T>(value: string | null | undefined): T | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as T) : undefined;
  } catch {
    return undefined;
  }
}

async function analyzeWithFallback(input: AnalyzeInput) {
  return analyzeMistake(input).catch(async (error) => {
    if (!isMiniMaxFailure(error) || !shouldFallbackToSimulation()) {
      throw error;
    }

    console.error("MiniMax analysis failed; falling back to simulation", error);
    const analysis = await analyzeWithSimulation(input);
    return { mode: "simulation" as const, analysis, analyses: [analysis] };
  });
}

function withSourceImageIndex(analysis: AnalysisOutput, sourceImageIndex: number): AnalysisOutput {
  return { ...analysis, sourceImageIndex };
}

function uploadedImageForJob(job: { imageIndex: number; filename: string; imagePath: string }) {
  return {
    index: job.imageIndex,
    filename: job.filename,
    url: `/api/uploads/${encodeURIComponent(path.basename(job.imagePath))}`
  };
}

async function updateBatchStatus(batchId: string) {
  const jobs = await prisma.analysisJob.findMany({
    where: { batchId },
    select: { status: true }
  });

  const status = jobs.every((job) => job.status === "succeeded")
    ? "succeeded"
    : jobs.some((job) => job.status === "processing")
      ? "processing"
      : jobs.some((job) => job.status === "queued")
        ? "processing"
        : jobs.some((job) => job.status === "succeeded")
          ? "partial"
          : "failed";

  await prisma.analysisBatch.update({
    where: { id: batchId },
    data: { status }
  });
}

async function claimQueuedJobs() {
  const jobs = await prisma.analysisJob.findMany({
    where: { status: "queued" },
    orderBy: { createdAt: "asc" },
    take: maxWorkerConcurrency
  });

  const claimed = [];
  for (const job of jobs) {
    const updated = await prisma.analysisJob.updateMany({
      where: { id: job.id, status: "queued" },
      data: {
        status: "processing",
        errorMessage: null,
        startedAt: new Date()
      }
    });

    if (updated.count === 1) {
      claimed.push(job.id);
    }
  }

  return prisma.analysisJob.findMany({
    where: { id: { in: claimed } },
    orderBy: { createdAt: "asc" }
  });
}

async function processJob(jobId: string) {
  const job = await prisma.analysisJob.findUnique({ where: { id: jobId } });
  if (!job) {
    return;
  }

  try {
    await prisma.analysisBatch.update({
      where: { id: job.batchId },
      data: { status: "processing" }
    });

    const imagePath = job.analysisImagePath ?? job.imagePath;
    const imageBase64 = (await readFile(path.join(process.cwd(), imagePath))).toString("base64");
    const paperVisionContext = await analyzeImageWithOcr({
      filename: job.filename,
      mimeType: job.analysisMimeType,
      imageBase64,
      sourceImageIndex: job.imageIndex
    });
    const paperVisionContexts = paperVisionContext ? [paperVisionContext] : [];
    const analyzeInput: AnalyzeInput = {
      filename: job.filename,
      mimeType: job.analysisMimeType,
      imageBase64,
      images: [{ filename: job.filename, mimeType: job.analysisMimeType, imageBase64 }],
      paperVisionContexts,
      subjectHint: (job.subjectHint || undefined) as Subject | undefined,
      gradeHint: (job.gradeHint || undefined) as Grade | undefined,
      analysisDetail: "compact"
    };

    const result = await analyzeWithFallback(analyzeInput);
    const analyses = (result.analyses ?? [result.analysis]).map((analysis) => withSourceImageIndex(analysis, job.imageIndex));
    const savedMistakes: SavedMistakeSummary[] = [];

    for (const analysis of analyses) {
      const saved = await saveAnalysisAsMistake({
        studentId: STUDENT_ID,
        imagePath: job.imagePath,
        analysis
      });
      savedMistakes.push({
        mistakeId: saved.mistake.id,
        gapSeverity: saved.gap.severity as GapSeverity
      });
    }

    await prisma.analysisJob.update({
      where: { id: job.id },
      data: {
        status: "succeeded",
        errorMessage: null,
        paperVisionContextJson: paperVisionContext ? JSON.stringify(paperVisionContext) : null,
        analysesJson: JSON.stringify(analyses),
        savedMistakesJson: JSON.stringify(savedMistakes),
        completedAt: new Date()
      }
    });
  } catch (error) {
    console.error(`Async analysis job failed for ${job.filename}`, error);
    await prisma.analysisJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
        completedAt: new Date()
      }
    });
  } finally {
    await updateBatchStatus(job.batchId);
  }
}

async function runWorkerLoop() {
  if (runningState.active) {
    return;
  }

  runningState.active = true;
  try {
    while (true) {
      const jobs = await claimQueuedJobs();
      if (jobs.length === 0) {
        return;
      }
      await Promise.all(jobs.map((job) => processJob(job.id)));
    }
  } finally {
    runningState.active = false;
  }
}

export function triggerAnalysisWorker() {
  if (process.env.NODE_ENV === "test") {
    return;
  }
  void runWorkerLoop();
}

export async function getAnalysisBatchView(batchId: string) {
  const batch = await prisma.analysisBatch.findFirst({
    where: { id: batchId, studentId: STUDENT_ID },
    include: { jobs: { orderBy: { imageIndex: "asc" } } }
  });

  if (!batch) {
    return null;
  }

  const jobs = batch.jobs.map((job) => {
    const analyses = parseJsonArray<AnalysisOutput>(job.analysesJson);
    const savedMistakes = parseJsonArray<SavedMistakeSummary>(job.savedMistakesJson);
    const paperVisionContext = parseJsonObject<PaperVisionContext>(job.paperVisionContextJson);

    return {
      id: job.id,
      imageIndex: job.imageIndex,
      filename: job.filename,
      status: job.status,
      retryCount: job.retryCount,
      errorMessage: job.errorMessage,
      startedAt: job.startedAt?.toISOString(),
      completedAt: job.completedAt?.toISOString(),
      image: uploadedImageForJob(job),
      paperVisionContext,
      analyses,
      savedMistakes
    };
  });

  const analyses = jobs.flatMap((job) => job.analyses);
  const savedMistakes = jobs.flatMap((job) => job.savedMistakes);
  const firstAnalysis = analyses[0];
  const firstSaved = savedMistakes[0];

  return {
    batch: {
      id: batch.id,
      status: batch.status,
      total: batch.total,
      completed: jobs.filter((job) => job.status === "succeeded" || job.status === "failed").length,
      succeeded: jobs.filter((job) => job.status === "succeeded").length,
      failed: jobs.filter((job) => job.status === "failed").length,
      createdAt: batch.createdAt.toISOString(),
      updatedAt: batch.updatedAt.toISOString()
    },
    jobs,
    result: firstAnalysis && firstSaved
      ? {
          mode: "api" as AnalysisMode,
          analysis: firstAnalysis,
          analyses,
          mistakeId: firstSaved.mistakeId,
          gapSeverity: firstSaved.gapSeverity,
          savedMistakes,
          uploadedImages: jobs.map((job) => job.image),
          paperVisionContexts: jobs.map((job) => job.paperVisionContext).filter(Boolean),
          imageGroups: jobs.map((job) => ({
            image: job.image,
            paperVisionContext: job.paperVisionContext,
            analyses: job.analyses,
            savedMistakes: job.savedMistakes,
            status: job.status,
            errorMessage: job.errorMessage,
            jobId: job.id
          }))
        }
      : null
  };
}

export async function retryFailedAnalysisJobs(batchId: string, jobIds?: string[]) {
  const jobs = await prisma.analysisJob.findMany({
    where: {
      batchId,
      studentId: STUDENT_ID,
      status: "failed",
      ...(jobIds?.length ? { id: { in: jobIds } } : {})
    }
  });

  if (jobs.length === 0) {
    return { retried: 0 };
  }

  await prisma.analysisJob.updateMany({
    where: { id: { in: jobs.map((job) => job.id) } },
    data: {
      status: "queued",
      retryCount: { increment: 1 },
      errorMessage: null,
      startedAt: null,
      completedAt: null
    }
  });
  await prisma.analysisBatch.update({
    where: { id: batchId },
    data: { status: "processing" }
  });
  triggerAnalysisWorker();

  return { retried: jobs.length };
}
