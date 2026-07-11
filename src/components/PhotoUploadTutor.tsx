"use client";

import { LoaderCircle, Send, Upload, X } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";

import { AnalysisCard } from "@/components/AnalysisCard";
import { formatDateTimeToMinute } from "@/lib/date-format";
import {
  grades,
  subjects,
  type AnalysisOutput,
  type GapSeverity,
  type Grade,
  type PaperVisionContext,
  type Subject
} from "@/lib/types";

type AnalyzeResponse = {
  mode: "api" | "simulation";
  analysis: AnalysisOutput;
  analyses?: AnalysisOutput[];
  mistakeId: string;
  gapSeverity: GapSeverity;
  savedMistakes?: Array<{ mistakeId: string; gapSeverity: GapSeverity }>;
  uploadedImages?: UploadedImage[];
  paperVisionContexts?: PaperVisionContext[];
  imageGroups?: ImageGroup[];
};

type AnalysisBatch = {
  id: string;
  status: "queued" | "processing" | "partial" | "succeeded" | "failed";
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
  createdAt: string;
  updatedAt: string;
};

type AnalysisJobView = {
  id: string;
  imageIndex: number;
  filename: string;
  status: "queued" | "processing" | "succeeded" | "failed" | "needs_review";
  retryCount: number;
  errorMessage?: string | null;
  image: UploadedImage;
  paperVisionContext?: PaperVisionContext;
  analyses: AnalysisOutput[];
  savedMistakes: Array<{ mistakeId: string; gapSeverity: GapSeverity }>;
};

type AnalysisBatchView = {
  batch: AnalysisBatch;
  jobs: AnalysisJobView[];
  result: AnalyzeResponse | null;
};

type QueuedAnalyzeResponse = Pick<AnalysisBatchView, "batch" | "jobs"> & {
  mode: "queued";
};

type UploadedImage = {
  index: number;
  filename: string;
  url: string;
  role?: "question" | "answer_sheet" | "unknown";
};

type ImageGroup = {
  image: UploadedImage;
  paperVisionContext?: PaperVisionContext;
  analyses: AnalysisOutput[];
  savedMistakes: Array<{ mistakeId: string; gapSeverity: GapSeverity }>;
  status?: string;
  errorMessage?: string | null;
  jobId?: string;
  role?: "question" | "answer_sheet" | "unknown";
};

type HistoryEntry = AnalyzeResponse & {
  messages?: ChatMessage[];
  createdAt?: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const defaultAssistantMessage = "先上传一张错题照片，我会把错因、知识点和母题整理出来。";

function PaperVisionPanel({ context }: { context: PaperVisionContext }) {
  const sampleBlocks = context.textBlocks.slice(0, 3);

  return (
    <div className="rounded-md border border-indigo-200 bg-indigo-50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-medium text-indigo-800">OCR 证据</p>
        <span className="rounded-md border border-indigo-200 bg-white px-2 py-1 text-xs text-indigo-800">
          {context.summary}
        </span>
        {context.status !== "available" ? (
          <span className="rounded-md border border-amber-200 bg-white px-2 py-1 text-xs text-amber-800">
            {context.status === "failed" ? "OCR 失败" : "未识别到文字"}
          </span>
        ) : null}
      </div>
      {sampleBlocks.length > 0 ? (
        <div className="mt-2 space-y-1 text-xs leading-5 text-indigo-950">
          {sampleBlocks.map((block, index) => (
            <p key={`${block.text}-${index}`} className="line-clamp-1">
              {block.text}
            </p>
          ))}
        </div>
      ) : context.rawText ? (
        <p className="mt-2 line-clamp-2 text-xs leading-5 text-indigo-950">{context.rawText}</p>
      ) : null}
    </div>
  );
}

async function readJson(response: Response) {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function PhotoUploadTutor() {
  const [files, setFiles] = useState<File[]>([]);
  const [subjectHint, setSubjectHint] = useState<Subject | "">("");
  const [gradeHint, setGradeHint] = useState<Grade | "">("");
  const [paperMode, setPaperMode] = useState<"independent_pages" | "question_pages_with_answer_sheet">("independent_pages");
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: defaultAssistantMessage }
  ]);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isChatting, setIsChatting] = useState(false);
  const [previewImage, setPreviewImage] = useState<UploadedImage | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [batchView, setBatchView] = useState<AnalysisBatchView | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const response = await fetch("/api/history");
      const data = await readJson(response);
      if (response.ok && Array.isArray(data.history)) {
        setHistory(data.history as HistoryEntry[]);
      }
    } catch {
      // History is optional; upload and chat should remain usable if it cannot load.
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const loadBatch = useCallback(async (batchId: string) => {
    const response = await fetch(`/api/analysis-batches/${batchId}`);
    const data = await readJson(response);
    if (!response.ok) {
      throw new Error(typeof data.error === "string" ? data.error : "处理状态查询失败。");
    }
    const nextBatchView = data as AnalysisBatchView;
    setBatchView(nextBatchView);
    if (nextBatchView.result) {
      setResult(nextBatchView.result);
    }
    if (nextBatchView.batch.status === "succeeded" || nextBatchView.batch.status === "partial" || nextBatchView.batch.status === "failed") {
      void loadHistory();
    }
    return nextBatchView;
  }, [loadHistory]);

  useEffect(() => {
    if (!batchView || batchView.batch.status === "succeeded" || batchView.batch.status === "partial" || batchView.batch.status === "failed") {
      return;
    }

    const timer = window.setInterval(() => {
      void loadBatch(batchView.batch.id).catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [batchView, loadBatch]);

  async function analyze() {
    if (files.length === 0) {
      setError("请先选择至少一张错题照片。");
      return;
    }

    setError("");
    setIsAnalyzing(true);

    const formData = new FormData();
    files.forEach((item) => formData.append("files", item));
    if (subjectHint) {
      formData.append("subjectHint", subjectHint);
    }
    if (gradeHint) {
      formData.append("gradeHint", gradeHint);
    }
    formData.append("paperMode", paperMode);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData
      });
      const data = await readJson(response);

      if (!response.ok) {
        setError(typeof data.error === "string" ? data.error : "分析失败，请稍后重试。");
        return;
      }

      if (response.status === 202 && data.mode === "queued") {
        const queued = data as QueuedAnalyzeResponse;
        setBatchView({ batch: queued.batch, jobs: queued.jobs, result: null });
        setResult(null);
        setMessages([
          {
            role: "assistant",
            content: `已创建 ${queued.batch.total} 个处理任务。AI 会逐项分析，失败的项目可以批量重试。`
          }
        ]);
        void loadBatch(queued.batch.id).catch(() => undefined);
        return;
      }

      const nextResult = data as AnalyzeResponse;
      const analyses = nextResult.analyses ?? [nextResult.analysis];
      setResult(nextResult);
      setMessages([
        {
          role: "assistant",
          content:
            analyses.length === 1
              ? `我已经登记这道${nextResult.analysis.subject}错题，重点看「${nextResult.analysis.knowledgePoints[0]?.name ?? nextResult.analysis.questionType}」。`
              : `我已经登记 ${analyses.length} 道错题。先从第 1 题「${analyses[0]?.knowledgePoints[0]?.name ?? analyses[0]?.questionType ?? "错题"}」开始复习。`
        }
      ]);
      void loadHistory();
    } catch {
      setError("网络连接异常，请稍后重试。");
    } finally {
      setIsAnalyzing(false);
    }
  }

  function selectFiles(fileList: FileList | null) {
    const nextFiles = Array.from(fileList ?? []);
    if (nextFiles.length > 16) {
      setFiles(nextFiles.slice(0, 16));
      setError("一次最多上传 16 张图片。");
      return;
    }

    setFiles(nextFiles);
    setError("");
  }

  const fileSummary =
    files.length === 0
      ? "JPG、PNG、WebP 或 HEIC，单张最大 8MB，最多 16 张"
      : files.length === 1
        ? files[0].name
        : `已选择 ${files.length} 张图片`;

  const resultImageGroups =
    result?.imageGroups?.length
      ? result.imageGroups
      : result
        ? [
            {
              image: result.uploadedImages?.[0],
              paperVisionContext: result.paperVisionContexts?.[0],
              analyses: result.analyses ?? [result.analysis],
              role: result.uploadedImages?.[0]?.role,
              savedMistakes:
                result.savedMistakes ?? [{ mistakeId: result.mistakeId, gapSeverity: result.gapSeverity }]
            }
          ]
        : [];

  const processingJobs = batchView?.jobs ?? [];
  const hasFailedJobs = processingJobs.some((job) => job.status === "failed");

  async function retryFailedJobs() {
    if (!batchView || !hasFailedJobs) {
      return;
    }
    setError("");
    try {
      const response = await fetch(`/api/analysis-batches/${batchView.batch.id}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobIds: processingJobs.filter((job) => job.status === "failed").map((job) => job.id)
        })
      });
      const data = await readJson(response);
      if (!response.ok) {
        setError(typeof data.error === "string" ? data.error : "重试失败，请稍后再试。");
        return;
      }
      await loadBatch(batchView.batch.id);
    } catch {
      setError("网络连接异常，重试请求未发送。");
    }
  }

  function restoreHistory(entry: HistoryEntry) {
    setResult(entry);
    setMessages(
      entry.messages?.length
        ? entry.messages
        : [{ role: "assistant", content: entry.analysis.studentFriendlyExplanation }]
    );
    setError("");
  }

  async function sendQuestion() {
    const trimmed = question.trim();
    if (!trimmed || isChatting) {
      return;
    }

    setQuestion("");
    setMessages((current) => [...current, { role: "user", content: trimmed }]);

    if (!result) {
      setMessages((current) => [
        ...current,
        { role: "assistant", content: "先上传错题照片，我才能结合这道题继续讲。" }
      ]);
      return;
    }

    setIsChatting(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, mistakeId: result.mistakeId })
      });
      const data = await readJson(response);
      const reply =
        typeof data.reply === "string"
          ? data.reply
          : typeof data.error === "string"
            ? data.error
            : "老师暂时没有回答出来，换一种问法试试。";

      setMessages((current) => [...current, { role: "assistant", content: reply }]);
    } catch {
      setMessages((current) => [
        ...current,
        { role: "assistant", content: "网络连接异常，稍后再问老师一次。" }
      ]);
    } finally {
      setIsChatting(false);
    }
  }

  return (
    <>
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-5">
      <section className="min-w-0 space-y-4 lg:space-y-5">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-ink">AI 老师</h1>
              <p className="mt-1 text-sm text-slate-600">拍照登记错题，老师会整理错因、漏洞和母题。</p>
            </div>
            <button
              type="button"
              onClick={analyze}
              disabled={isAnalyzing}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400 sm:w-auto"
            >
              <Upload aria-hidden="true" size={18} />
              {isAnalyzing ? "分析中" : "开始分析"}
            </button>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_160px_160px]">
            <label className="flex min-h-28 cursor-pointer flex-col justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 transition hover:border-slate-400 hover:bg-white">
              <span className="text-sm font-medium text-ink">上传错题照片</span>
              <span className="mt-1 text-xs text-slate-500">{fileSummary}</span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(event) => selectFiles(event.target.files)}
              />
            </label>

            <label className="text-sm font-medium text-slate-700 md:col-span-3">
              图片组合
              <select
                value={paperMode}
                onChange={(event) => setPaperMode(event.target.value as "independent_pages" | "question_pages_with_answer_sheet")}
                className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-ink md:max-w-md"
              >
                <option value="independent_pages">逐张识别（每张图片独立判题）</option>
                <option value="question_pages_with_answer_sheet">整卷识别（自动识别题目页和答题卡）</option>
              </select>
              <span className="mt-1 block text-xs font-normal text-slate-500">
                不限制上传顺序，可混合上传多张题目页和答题卡；系统会自动识别页面角色并按题号对照作答。
              </span>
            </label>

            <label className="text-sm font-medium text-slate-700">
              学科
              <select
                value={subjectHint}
                onChange={(event) => setSubjectHint(event.target.value as Subject | "")}
                className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-ink"
              >
                <option value="">自动识别学科</option>
                {subjects.map((subject) => (
                  <option key={subject} value={subject}>
                    {subject}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm font-medium text-slate-700">
              年级
              <select
                value={gradeHint}
                onChange={(event) => setGradeHint(event.target.value as Grade | "")}
                className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-ink"
              >
                <option value="">自动识别年级</option>
                {grades.map((grade) => (
                  <option key={grade} value={grade}>
                    {grade}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {isAnalyzing ? (
            <div
              role="status"
              className="mt-4 flex items-start gap-3 rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950"
            >
              <LoaderCircle aria-hidden="true" className="mt-0.5 animate-spin text-sky-700" size={18} />
              <div>
                <p className="font-medium">AI 正在识别照片并整理错因，通常需要 15-30 秒。</p>
                <p className="mt-1 text-sky-800">请保持页面打开，完成后会自动生成讲解、母题和练习。</p>
              </div>
            </div>
          ) : null}

          {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
        </div>

        {batchView ? (
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-ink">AI 处理列表</h2>
                <p className="mt-1 text-sm text-slate-600">
                  已完成 {batchView.batch.completed}/{batchView.batch.total}，成功 {batchView.batch.succeeded}，失败 {batchView.batch.failed}
                </p>
              </div>
              {hasFailedJobs ? (
                <button
                  type="button"
                  onClick={retryFailedJobs}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-sky-300 hover:text-sky-700 sm:w-auto"
                >
                  批量重试失败项
                </button>
              ) : null}
            </div>
            <div className="mt-4 grid gap-2">
              {processingJobs.map((job) => {
                const statusText =
                  job.status === "queued"
                    ? "排队中"
                    : job.status === "processing"
                      ? "AI 处理中"
                      : job.status === "succeeded"
                        ? "AI 处理成功"
                        : job.status === "needs_review"
                          ? "待人工复核"
                        : "AI 处理失败";
                const statusClassName =
                  job.status === "succeeded"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : job.status === "failed"
                      ? "border-rose-200 bg-rose-50 text-rose-700"
                      : job.status === "needs_review"
                        ? "border-amber-200 bg-amber-50 text-amber-800"
                      : "border-sky-200 bg-sky-50 text-sky-800";

                return (
                  <div key={job.id} className="min-w-0 rounded-md border border-slate-200 bg-slate-50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">
                          第 {job.imageIndex + 1} 张 · {job.filename}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          已识别错题 {job.analyses.length} 道
                          {job.retryCount > 0 ? ` · 已重试 ${job.retryCount} 次` : ""}
                        </p>
                      </div>
                      <span className={`rounded-md border px-2 py-1 text-xs font-medium ${statusClassName}`}>
                        {statusText}
                      </span>
                    </div>
                    {job.errorMessage ? (
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-rose-700">{job.errorMessage}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {result ? (
          <div className="space-y-4">
            {resultImageGroups.map((group, groupIndex) => (
              <section
                key={group.image?.url ?? `image-group-${groupIndex}`}
                className="min-w-0 space-y-4 rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:p-4"
              >
                {group.image ? (
                  <div className="space-y-3">
                    <button
                      type="button"
                      aria-label={`查看 ${group.image.filename} 原图`}
                      onClick={() => setPreviewImage(group.image ?? null)}
                      className="block w-full overflow-hidden rounded-md border border-slate-200 bg-slate-50 text-left transition hover:border-slate-400"
                    >
                      <img
                        src={group.image.url}
                        alt={`${group.image.filename} 原图预览`}
                        className="h-auto max-h-[420px] w-full object-contain"
                      />
                    </button>
                    <p className="mt-2 text-xs text-slate-500">
                      {group.role === "answer_sheet" ? "答题卡（错误标记与解析）" : group.role === "unknown" ? "页面角色待 AI 判断" : "作为参考"} · 点击图片查看原图：{group.image.filename}
                    </p>
                    {group.paperVisionContext ? <PaperVisionPanel context={group.paperVisionContext} /> : null}
                  </div>
                ) : null}

                {group.analyses.length > 0 ? (
                  <div className="space-y-4">
                    {group.analyses.map((analysis, index) => (
                      <div key={`${analysis.questionType}-${groupIndex}-${index}`} className="space-y-2">
                        {group.analyses.length > 1 || resultImageGroups.length > 1 ? (
                          <p className="text-sm font-medium text-slate-600">第 {index + 1} 道错题</p>
                        ) : null}
                        <AnalysisCard
                          analysis={analysis}
                          gapSeverity={group.savedMistakes[index]?.gapSeverity ?? result.gapSeverity}
                          mode={result.mode}
                        />
                      </div>
                    ))}
                  </div>
                ) : group.role === "answer_sheet" ? (
                  <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">这张答题卡没有识别到能明确对应题号的错题。</p>
                ) : group.role === "question" ? (
                  <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">作为参考</p>
                ) : (
                  <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
                    这张图片没有识别到明确错题。
                  </p>
                )}
              </section>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600 shadow-sm sm:p-5">
            上传后会在这里看到题目识别、错因、孩子版讲解、母题模板和练习题。
          </div>
        )}
      </section>

      <aside className="flex min-h-[420px] min-w-0 flex-col rounded-lg border border-slate-200 bg-white shadow-sm lg:min-h-[520px]">
        <section className="border-b border-slate-200 p-4">
          <h2 className="text-base font-semibold text-ink">历史记录</h2>
          <p className="mt-1 text-sm text-slate-500">最近的 AI 分析和对话。</p>
          {history.length === 0 ? (
            <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">暂无历史记录。</p>
          ) : (
            <div className="mt-3 space-y-2">
              {history.map((entry) => (
                <button
                  key={entry.mistakeId}
                  type="button"
                  aria-label={`查看历史 ${entry.analysis.questionType}`}
                  onClick={() => restoreHistory(entry)}
                  className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-left transition hover:border-slate-400 hover:bg-white"
                >
                  <span className="block text-xs text-slate-500">
                    {entry.analysis.grade} · {entry.analysis.subject}
                    {entry.createdAt ? ` · ${formatDateTimeToMinute(entry.createdAt)}` : ""}
                  </span>
                  <span className="mt-1 block truncate text-sm font-medium text-ink">
                    {entry.analysis.questionType}
                  </span>
                  <span className="mt-1 block line-clamp-2 text-xs leading-5 text-slate-600">
                    {entry.analysis.mistakeReason}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <div className="border-b border-slate-200 p-4">
          <h2 className="text-base font-semibold text-ink">继续问老师</h2>
          <p className="mt-1 text-sm text-slate-500">只回答学习相关问题。</p>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`rounded-md px-3 py-2 text-sm leading-6 ${
                message.role === "assistant"
                  ? "bg-slate-100 text-slate-700"
                  : "ml-4 bg-slate-900 text-white sm:ml-8"
              }`}
            >
              {message.content}
            </div>
          ))}
        </div>

        <div className="border-t border-slate-200 p-3">
          <div className="flex min-w-0 gap-2">
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void sendQuestion();
                }
              }}
              placeholder="继续问老师：为什么这里要这样做？"
              className="h-10 min-w-0 flex-1 rounded-md border border-slate-300 px-3 text-sm text-ink placeholder:text-slate-400"
            />
            <button
              type="button"
              onClick={sendQuestion}
              disabled={isChatting}
              aria-label="发送问题"
              className="grid h-10 w-10 place-items-center rounded-md bg-slate-900 text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              <Send aria-hidden="true" size={18} />
            </button>
          </div>
        </div>
      </aside>
    </div>
    {previewImage ? (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${previewImage.filename} 原图`}
        className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-4"
        onClick={() => setPreviewImage(null)}
      >
        <div
          className="max-h-full w-full max-w-5xl overflow-hidden rounded-lg bg-white shadow-xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <p className="truncate text-sm font-medium text-ink">{previewImage.filename}</p>
            <button
              type="button"
              aria-label="关闭原图"
              onClick={() => setPreviewImage(null)}
              className="grid h-9 w-9 place-items-center rounded-md text-slate-600 transition hover:bg-slate-100 hover:text-ink"
            >
              <X aria-hidden="true" size={18} />
            </button>
          </div>
          <div className="max-h-[calc(100vh-120px)] overflow-auto bg-slate-100 p-3">
            <img
              src={previewImage.url}
              alt={`${previewImage.filename} 原图`}
              className="mx-auto h-auto max-w-full rounded-md bg-white"
            />
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}
