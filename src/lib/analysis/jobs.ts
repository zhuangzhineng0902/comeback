import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

import { analyzeMistake } from "@/lib/analyzer";
import { detectAnswerSheetMistakesWithMiniMax } from "@/lib/analyzer/minimax";
import { analyzeWithSimulation, type AnalyzeInput } from "@/lib/analyzer/simulated";
import { prisma } from "@/lib/db";
import { analyzeImageWithOcr } from "@/lib/ocr/client";
import { saveAnalysisAsMistake } from "@/lib/repositories/mistakes";
import type { AnalysisOutput, GapSeverity, Grade, PaperVisionContext, Subject } from "@/lib/types";
import { resolveStoredUploadPath } from "@/lib/uploads";

const STUDENT_ID = "default-student";
const maxWorkerConcurrency = 4;

type AnalysisMode = "api" | "simulation";
type SavedMistakeSummary = {
  mistakeId: string;
  gapSeverity: GapSeverity;
  sourceImageIndex?: number;
  answerSheetImageIndex?: number;
};
type RelatedImage = {
  filename: string;
  imagePath: string;
  analysisImagePath: string | null;
  analysisMimeType: string;
  role: "question" | "answer_sheet" | "unknown";
};
type LoadedPage = RelatedImage & {
  imageBase64: string;
  paperVisionContext: PaperVisionContext | null;
};
type MatchedMistake = {
  questionId: string;
  subQuestionId?: string;
  questionImageIndex: number;
  answerSheetImageIndex: number;
  questionText?: string;
  evidenceSummary: string;
  candidate: NonNullable<PaperVisionContext["mistakeCandidates"]>[number];
};

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

function parsePaperVisionContexts(value: string | null | undefined): PaperVisionContext[] {
  const array = parseJsonArray<PaperVisionContext>(value);
  return array.length > 0 ? array : [parseJsonObject<PaperVisionContext>(value)].filter(Boolean) as PaperVisionContext[];
}

export function classifyCompositePageRole(
  page: Pick<RelatedImage, "filename" | "role">,
  context: PaperVisionContext | null
): RelatedImage["role"] {
  if (page.role !== "unknown") {
    return page.role;
  }

  const filename = page.filename.toLowerCase();
  const text = `${context?.rawText ?? ""}\n${context?.textBlocks.map((block) => block.text).join("\n") ?? ""}`;
  if (context?.pageRoleHint === "answer_sheet" || (context?.layoutRegions?.length ?? 0) >= 1) {
    return "answer_sheet";
  }
  if (/答题卡|答题纸|答题区域|答案无效/.test(text) || /答题|answer.?sheet|答卷/.test(filename)) {
    return "answer_sheet";
  }
  const answerSheetSignals = [
    /答卷|填涂|准考证|座位号/.test(text),
    (context?.gradingMarks?.length ?? 0) >= 10 && (context?.questionCandidates.length ?? 0) <= 2
  ].filter(Boolean).length;
  const questionSignals =
    (context?.questionCandidates.length ?? 0) * 2 +
    (context?.textBlocks.filter((block) => block.role === "question").length ?? 0) +
    (/选择题|填空题|解答题|阅读下面|计算|证明/.test(text) ? 1 : 0);

  if (answerSheetSignals > 0 && answerSheetSignals > questionSignals) {
    return "answer_sheet";
  }
  if (questionSignals > 0) {
    return "question";
  }
  return "unknown";
}

function paperVisionForAnswerMatching(context: PaperVisionContext, role: RelatedImage["role"]): PaperVisionContext {
  if (role !== "question") {
    return context;
  }

  return {
    ...context,
    textBlocks: context.textBlocks.map((block) => block.role === "teacherMark" ? { ...block, role: "other" } : block),
    gradingMarks: [],
    mistakeCandidates: []
  };
}

function normalizedQuestionId(value: string | undefined) {
  return value?.match(/\d+/)?.[0];
}

function isReliableMistakeCandidate(candidate: MatchedMistake["candidate"]) {
  return (
    candidate.judgement === "wrong" ||
    candidate.judgement === "partial" ||
    candidate.markTypes.some((mark) => mark === "cross" || mark === "partial" || mark === "deduction")
  );
}

function isReviewOnlyAnalysis(analysis: AnalysisOutput) {
  return (
    analysis.gradingEvidence?.needsConfirmation === true ||
    /OCR|复核|待确认/.test(analysis.questionType) ||
    /人工复核|重新推导|需要根据题干/.test(analysis.correctAnswer)
  );
}

export function matchAnswerSheetMistakes(loadedPages: LoadedPage[]): { matched: MatchedMistake[]; unmatched: number } {
  const questionIndex = new Map<string, { pageIndex: number; text?: string }>();
  const questionIdsByPage = new Map<number, number[]>();
  for (const [pageIndex, page] of loadedPages.entries()) {
    if (page.role !== "question" || !page.paperVisionContext) continue;
    for (const question of page.paperVisionContext.questionCandidates) {
      const questionId = normalizedQuestionId(question.questionId);
      if (questionId && !questionIndex.has(questionId)) {
        questionIndex.set(questionId, { pageIndex, text: question.text });
        const ids = questionIdsByPage.get(pageIndex) ?? [];
        ids.push(Number(questionId));
        questionIdsByPage.set(pageIndex, ids);
      }
    }
  }

  const matched: MatchedMistake[] = [];
  let unmatched = 0;
  const seen = new Set<string>();
  for (const [answerSheetImageIndex, page] of loadedPages.entries()) {
    if (page.role !== "answer_sheet" || !page.paperVisionContext) continue;
    for (const candidate of page.paperVisionContext.mistakeCandidates ?? []) {
      const questionId = normalizedQuestionId(candidate.questionId);
      let question = questionId ? questionIndex.get(questionId) : undefined;
      if (!question && questionId) {
        const targetId = Number(questionId);
        const inferredPage = Array.from(questionIdsByPage.entries())
          .map(([pageIndex, ids]) => ({
            pageIndex,
            distance: targetId < Math.min(...ids)
              ? Math.min(...ids) - targetId
              : targetId > Math.max(...ids)
                ? targetId - Math.max(...ids)
                : 0
          }))
          .filter((item) => item.distance <= 1)
          .sort((left, right) => left.distance - right.distance)[0];
        if (inferredPage) {
          question = {
            pageIndex: inferredPage.pageIndex,
            text: `OCR 未完整识别第 ${questionId} 题题干，请查看该题目页原图中的第 ${questionId} 题。`
          };
        }
      }
      const key = `${answerSheetImageIndex}:${questionId ?? "unknown"}:${candidate.subQuestionId ?? ""}`;
      if (!questionId || !question || !isReliableMistakeCandidate(candidate) || seen.has(key)) {
        unmatched += 1;
        continue;
      }
      seen.add(key);
      matched.push({
        questionId,
        subQuestionId: candidate.subQuestionId,
        questionImageIndex: question.pageIndex,
        answerSheetImageIndex,
        questionText: question.text,
        evidenceSummary: candidate.evidenceSummary,
        candidate
      });
    }
  }
  return { matched, unmatched };
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

async function answerSheetDetectionImages(loadedPages: LoadedPage[]) {
  return (await Promise.all(loadedPages.map(async (page, originalIndex) => {
    if (page.role !== "answer_sheet") return [];
    const source = Buffer.from(page.imageBase64, "base64");
    const metadata = await sharp(source).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (width <= height * 1.2 || width < 1200) {
      return [{ originalIndex, filename: page.filename, mimeType: page.analysisMimeType, imageBase64: page.imageBase64, part: "full" as const }];
    }
    const halfWidth = Math.floor(width / 2);
    const halfHeight = Math.floor(height * 0.58);
    const lowerTop = height - halfHeight;
    const regions = [
      { left: 0, top: 0, width: halfWidth, height: halfHeight, part: "左半页上部" },
      { left: 0, top: lowerTop, width: halfWidth, height: halfHeight, part: "左半页下部" },
      { left: halfWidth, top: 0, width: width - halfWidth, height: halfHeight, part: "右半页上部" },
      { left: halfWidth, top: lowerTop, width: width - halfWidth, height: halfHeight, part: "右半页下部" }
    ];
    return Promise.all(regions.map(async (region) => ({
      originalIndex,
      filename: `${page.filename}-${region.part}`,
      mimeType: "image/jpeg",
      imageBase64: (await sharp(source).extract({ left: region.left, top: region.top, width: region.width, height: region.height }).jpeg({ quality: 90 }).toBuffer()).toString("base64"),
      part: region.part
    })));
  }))).flat();
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
          : jobs.some((job) => job.status === "needs_review")
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

    const relatedImages = parseJsonArray<RelatedImage>(job.relatedImagesJson);
    const pages = relatedImages.length > 0
      ? relatedImages
      : [{ filename: job.filename, imagePath: job.imagePath, analysisImagePath: job.analysisImagePath, analysisMimeType: job.analysisMimeType, role: "question" as const }];
    const loadedPages = await Promise.all(pages.map(async (page, index) => {
      const imagePath = page.analysisImagePath ?? page.imagePath;
      const imageBase64 = (await readFile(resolveStoredUploadPath(imagePath))).toString("base64");
      const paperVisionContext = await analyzeImageWithOcr({ filename: page.filename, mimeType: page.analysisMimeType, imageBase64, sourceImageIndex: index });
      return { ...page, role: classifyCompositePageRole(page, paperVisionContext), imageBase64, paperVisionContext };
    }));
    const firstPage = loadedPages[0];
    const paperVisionContexts = loadedPages.flatMap((page) => page.paperVisionContext ? [page.paperVisionContext] : []);
    if (relatedImages.length > 0) {
      const detected = await detectAnswerSheetMistakesWithMiniMax({
        images: await answerSheetDetectionImages(loadedPages)
      }).catch((error) => {
        console.error("Answer-sheet grading detection failed; continuing with OCR candidates.", error);
        return [];
      });
      for (const candidate of detected) {
        if (candidate.confidence < 0.6) continue;
        const context = loadedPages[candidate.answerSheetImageIndex]?.paperVisionContext;
        if (!context) continue;
        const existing = context.mistakeCandidates ?? [];
        const duplicate = existing.some((item) => normalizedQuestionId(item.questionId) === normalizedQuestionId(candidate.questionId));
        if (!duplicate) {
          existing.push({
            questionId: candidate.questionId,
            subQuestionId: candidate.subQuestionId,
            confidence: candidate.confidence,
            markTypes: [candidate.markType],
            judgement: candidate.markType === "cross" ? "wrong" : "partial",
            evidenceSummary: candidate.deductedScore
              ? `${candidate.evidenceSummary}，扣 ${candidate.deductedScore} 分。`
              : candidate.evidenceSummary
          });
          context.mistakeCandidates = existing;
        }
      }
    }
    const baseAnalyzeInput: AnalyzeInput = {
      filename: pages.map((page) => page.filename).join(", "),
      mimeType: firstPage.analysisMimeType,
      imageBase64: firstPage.imageBase64,
      images: loadedPages.map((page) => ({ filename: page.filename, mimeType: page.analysisMimeType, imageBase64: page.imageBase64 })),
      paperVisionContexts: paperVisionContexts,
      subjectHint: (job.subjectHint || undefined) as Subject | undefined,
      gradeHint: (job.gradeHint || undefined) as Grade | undefined,
      analysisDetail: "compact",
      paperLayout: relatedImages.length > 0 ? "question_pages_with_answer_sheet" : "independent_pages",
      pageRoles: loadedPages.map((page) => page.role)
    };

    let analyses: AnalysisOutput[];
    let unmatchedCount = 0;
    if (relatedImages.length > 0) {
      const pairing = matchAnswerSheetMistakes(loadedPages);
      unmatchedCount = pairing.unmatched;
      const pairedResults = await mapWithConcurrency(pairing.matched, 2, async (match) => {
        const questionPage = loadedPages[match.questionImageIndex];
        const answerPage = loadedPages[match.answerSheetImageIndex];
        const questionContext = questionPage.paperVisionContext
          ? { ...paperVisionForAnswerMatching(questionPage.paperVisionContext, "question"), questionCandidates: questionPage.paperVisionContext.questionCandidates.filter((item) => normalizedQuestionId(item.questionId) === match.questionId) }
          : undefined;
        const answerContext = answerPage.paperVisionContext
          ? { ...answerPage.paperVisionContext, mistakeCandidates: [match.candidate] }
          : undefined;
        const result = await analyzeWithFallback({
          ...baseAnalyzeInput,
          filename: `${questionPage.filename}, ${answerPage.filename}`,
          mimeType: questionPage.analysisMimeType,
          imageBase64: questionPage.imageBase64,
          images: [questionPage, answerPage].map((page) => ({ filename: page.filename, mimeType: page.analysisMimeType, imageBase64: page.imageBase64 })),
          paperVisionContexts: [questionContext, answerContext].filter(Boolean) as PaperVisionContext[],
          pageRoles: ["question", "answer_sheet"],
          targetQuestion: {
            questionId: match.questionId,
            subQuestionId: match.subQuestionId,
            questionImageIndex: match.questionImageIndex,
            answerSheetImageIndex: match.answerSheetImageIndex,
            questionText: match.questionText,
            answerEvidence: match.evidenceSummary
          }
        });
        const analysis = (result.analyses ?? [result.analysis])[0];
        return analysis ? { ...analysis, sourceImageIndex: match.questionImageIndex, answerSheetImageIndex: match.answerSheetImageIndex } : null;
      });
      analyses = pairedResults.filter((analysis): analysis is NonNullable<typeof analysis> => analysis !== null);
    } else {
      const result = await analyzeWithFallback(baseAnalyzeInput);
      analyses = (result.analyses ?? [result.analysis]).map((analysis) => withSourceImageIndex(analysis, typeof analysis.sourceImageIndex === "number" ? analysis.sourceImageIndex : 0));
    }
    const savedMistakes: SavedMistakeSummary[] = [];
    const visibleAnalyses: AnalysisOutput[] = [];
    let reviewOnlyCount = 0;

    for (const analysis of analyses) {
      const saved = await saveAnalysisAsMistake({
        studentId: STUDENT_ID,
        imagePath: relatedImages.length > 0
          ? pages[analysis.answerSheetImageIndex ?? 0]?.imagePath ?? job.imagePath
          : pages[analysis.sourceImageIndex ?? 0]?.imagePath ?? job.imagePath,
        analysis
      });
      if (isReviewOnlyAnalysis(analysis)) {
        reviewOnlyCount += 1;
      } else {
        visibleAnalyses.push(analysis);
        savedMistakes.push({
          mistakeId: saved.mistake.id,
          gapSeverity: saved.gap.severity as GapSeverity,
          sourceImageIndex: analysis.sourceImageIndex,
          answerSheetImageIndex: analysis.answerSheetImageIndex
        });
      }
    }

    const needsReview = unmatchedCount > 0 || reviewOnlyCount > 0 || visibleAnalyses.length === 0;
    const reviewMessage = [
      unmatchedCount > 0 ? `${unmatchedCount} 个答题卡错题标记未能可靠匹配题目` : "",
      reviewOnlyCount > 0 ? `${reviewOnlyCount} 道配对题仅生成 OCR/不确定结果` : "",
      visibleAnalyses.length === 0 ? "没有可直接展示的可靠 AI 解析" : ""
    ].filter(Boolean).join("；");

    await prisma.analysisJob.update({
      where: { id: job.id },
      data: {
        status: needsReview ? "needs_review" : "succeeded",
        errorMessage: needsReview ? `${reviewMessage}，需人工复核。` : null,
        paperVisionContextJson: paperVisionContexts.length ? JSON.stringify(paperVisionContexts) : null,
        relatedImagesJson: relatedImages.length
          ? JSON.stringify(loadedPages.map((page) => ({
              filename: page.filename,
              imagePath: page.imagePath,
              analysisImagePath: page.analysisImagePath,
              analysisMimeType: page.analysisMimeType,
              role: page.role
            })))
          : null,
        analysesJson: JSON.stringify(visibleAnalyses),
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
    const paperVisionContexts = parsePaperVisionContexts(job.paperVisionContextJson);
    const relatedImages = parseJsonArray<RelatedImage>(job.relatedImagesJson);
    const pages = relatedImages.length > 0
      ? relatedImages.map((page, index) => ({
          index,
          filename: page.filename,
          role: page.role,
          url: `/api/uploads/${encodeURIComponent(path.basename(page.imagePath))}`,
          paperVisionContext: paperVisionContexts.find((context) => context.sourceImageIndex === index)
        }))
      : [{ ...uploadedImageForJob(job), role: "question" as const, paperVisionContext: paperVisionContexts[0] }];

    return {
      id: job.id,
      imageIndex: job.imageIndex,
      filename: job.filename,
      status: job.status,
      retryCount: job.retryCount,
      errorMessage: job.errorMessage,
      startedAt: job.startedAt?.toISOString(),
      completedAt: job.completedAt?.toISOString(),
      image: pages[0],
      pages,
      paperVisionContexts,
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
      completed: jobs.filter((job) => job.status === "succeeded" || job.status === "failed" || job.status === "needs_review").length,
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
          uploadedImages: jobs.flatMap((job) => job.pages),
          paperVisionContexts: jobs.flatMap((job) => job.paperVisionContexts),
          imageGroups: jobs.flatMap((job) => job.pages.map((page) => ({
            image: page,
            paperVisionContext: page.paperVisionContext,
            analyses: job.analyses.filter((analysis) =>
              job.pages.length > 1
                ? analysis.answerSheetImageIndex === page.index
                : (analysis.sourceImageIndex ?? 0) === page.index
            ),
            savedMistakes: job.savedMistakes.filter((summary) =>
              job.pages.length > 1
                ? summary.answerSheetImageIndex === page.index
                : (summary.sourceImageIndex ?? 0) === page.index
            ),
            status: job.status,
            errorMessage: job.errorMessage,
            role: page.role,
            jobId: job.id
          })))
        }
      : null
  };
}

export async function retryAnalysisJobs(batchId: string, jobIds?: string[]) {
  const jobs = await prisma.analysisJob.findMany({
    where: {
      batchId,
      studentId: STUDENT_ID,
      NOT: { status: { in: ["queued", "processing"] } },
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

export async function retryFailedAnalysisJobs(batchId: string, jobIds?: string[]) {
  const jobs = await prisma.analysisJob.findMany({
    where: {
      batchId,
      studentId: STUDENT_ID,
      status: "failed",
      ...(jobIds?.length ? { id: { in: jobIds } } : {})
    },
    select: { id: true }
  });

  if (jobs.length === 0) {
    return { retried: 0 };
  }

  return retryAnalysisJobs(batchId, jobs.map((job) => job.id));
}
