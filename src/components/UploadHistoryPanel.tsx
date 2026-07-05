"use client";

import { CheckSquare, RefreshCw, RotateCcw, Square } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";

import { formatDateTimeToMinute } from "@/lib/date-format";

type UploadStatus = "failed" | "queued" | "processing" | "needs_review" | "incomplete" | "succeeded";

type UploadHistoryItem = {
  id: string;
  kind: "job" | "single";
  batchId: string | null;
  batchStatus: string | null;
  batchTotal: number;
  jobId: string | null;
  filename: string;
  imageUrl: string;
  status: UploadStatus;
  statusLabel: string;
  parsedMistakeCount: number;
  needsReviewCount: number;
  retryCount: number;
  errorMessage: string | null;
  canRetry: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

type UploadHistoryResponse = {
  uploads: UploadHistoryItem[];
  summary: {
    total: number;
    failed: number;
    needsReview: number;
    incomplete: number;
    retryable: number;
  };
};

const statusClasses: Record<UploadStatus, string> = {
  failed: "border-red-200 bg-red-50 text-red-700",
  queued: "border-slate-200 bg-slate-50 text-slate-700",
  processing: "border-sky-200 bg-sky-50 text-sky-700",
  needs_review: "border-orange-200 bg-orange-50 text-orange-800",
  incomplete: "border-amber-200 bg-amber-50 text-amber-800",
  succeeded: "border-emerald-200 bg-emerald-50 text-emerald-700"
};

async function readJson(response: Response) {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function UploadHistoryPanel() {
  const [uploads, setUploads] = useState<UploadHistoryItem[]>([]);
  const [summary, setSummary] = useState<UploadHistoryResponse["summary"] | null>(null);
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const retryableUploads = useMemo(() => uploads.filter((upload) => upload.canRetry && upload.jobId), [uploads]);
  const selectedRetryableCount = selectedJobIds.filter((jobId) =>
    retryableUploads.some((upload) => upload.jobId === jobId)
  ).length;
  const allRetryableSelected = retryableUploads.length > 0 && selectedRetryableCount === retryableUploads.length;

  const loadHistory = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const response = await fetch("/api/upload-history", { cache: "no-store" });
      const data = await readJson(response);
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "上传历史加载失败。");
      }
      const nextData = data as unknown as UploadHistoryResponse;
      setUploads(nextData.uploads ?? []);
      setSummary(nextData.summary ?? null);
      setSelectedJobIds((current) =>
        current.filter((jobId) => (nextData.uploads ?? []).some((upload) => upload.jobId === jobId && upload.canRetry))
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "上传历史加载失败。");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (!uploads.some((upload) => upload.status === "queued" || upload.status === "processing")) {
      return;
    }

    const timer = window.setInterval(() => {
      void loadHistory();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [uploads, loadHistory]);

  function toggleJob(jobId: string) {
    setSelectedJobIds((current) =>
      current.includes(jobId) ? current.filter((item) => item !== jobId) : [...current, jobId]
    );
  }

  function toggleAllRetryable() {
    setSelectedJobIds(allRetryableSelected ? [] : retryableUploads.map((upload) => upload.jobId).filter(Boolean) as string[]);
  }

  async function retry(jobIds?: string[]) {
    setIsRetrying(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/upload-history/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(jobIds?.length ? { jobIds } : {})
      });
      const data = await readJson(response);
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "重跑失败，请稍后再试。");
      }
      const retried = typeof data.retried === "number" ? data.retried : 0;
      setMessage(retried > 0 ? `已重新排队 ${retried} 张失败图片。` : "当前没有可重跑的失败图片。");
      setSelectedJobIds([]);
      await loadHistory();
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : "重跑失败，请稍后再试。");
    } finally {
      setIsRetrying(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-slate-500">上传历史</p>
          <h1 className="mt-1 text-2xl font-semibold text-ink">试卷图片清单</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadHistory()}
            disabled={isLoading || isRetrying}
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} aria-hidden="true" />
            刷新
          </button>
          <button
            type="button"
            onClick={() => void retry(selectedJobIds)}
            disabled={isRetrying || selectedRetryableCount === 0}
            className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RotateCcw className={`h-4 w-4 ${isRetrying ? "animate-spin" : ""}`} aria-hidden="true" />
            重跑选中
          </button>
          <button
            type="button"
            onClick={() => void retry()}
            disabled={isRetrying || retryableUploads.length === 0}
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RotateCcw className={`h-4 w-4 ${isRetrying ? "animate-spin" : ""}`} aria-hidden="true" />
            重跑全部失败
          </button>
        </div>
      </div>

      {summary ? (
        <div className="grid gap-2 sm:grid-cols-4">
          <div className="rounded-md border border-slate-200 bg-white p-3">
            <p className="text-xs text-slate-500">总图片</p>
            <p className="mt-1 text-xl font-semibold text-ink">{summary.total}</p>
          </div>
          <div className="rounded-md border border-red-200 bg-red-50 p-3">
            <p className="text-xs text-red-700">AI 未解析成功</p>
            <p className="mt-1 text-xl font-semibold text-red-700">{summary.failed}</p>
          </div>
          <div className="rounded-md border border-orange-200 bg-orange-50 p-3">
            <p className="text-xs text-orange-800">待人工复核</p>
            <p className="mt-1 text-xl font-semibold text-orange-800">{summary.needsReview}</p>
          </div>
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs text-amber-800">未完全解析</p>
            <p className="mt-1 text-xl font-semibold text-amber-800">{summary.incomplete}</p>
          </div>
        </div>
      ) : null}

      {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {message ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>
      ) : null}

      <div className="rounded-md border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
          <button
            type="button"
            onClick={toggleAllRetryable}
            disabled={retryableUploads.length === 0}
            className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {allRetryableSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
            可重跑 {retryableUploads.length} 张
          </button>
          <p className="text-xs text-slate-500">仅 AI 失败的批量图片支持直接重跑</p>
        </div>

        {isLoading ? (
          <div className="p-6 text-sm text-slate-500">正在加载上传历史...</div>
        ) : uploads.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">还没有上传记录。</div>
        ) : (
          <div className="divide-y divide-slate-200">
            {uploads.map((upload) => {
              const checked = upload.jobId ? selectedJobIds.includes(upload.jobId) : false;
              return (
                <article key={`${upload.kind}-${upload.id}`} className="grid gap-3 p-3 sm:grid-cols-[96px_minmax(0,1fr)_auto] sm:items-center">
                  <div className="h-24 w-full overflow-hidden rounded-md border border-slate-200 bg-slate-50 sm:w-24">
                    <img src={upload.imageUrl} alt={upload.filename} className="h-full w-full object-cover" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-md border px-2 py-1 text-xs font-medium ${statusClasses[upload.status]}`}>
                        {upload.statusLabel}
                      </span>
                      <span className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500">
                        {upload.kind === "job" ? `批量任务 ${upload.batchTotal} 张` : "单张上传"}
                      </span>
                      {upload.retryCount > 0 ? (
                        <span className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500">
                          已重跑 {upload.retryCount} 次
                        </span>
                      ) : null}
                    </div>
                    <h2 className="mt-2 truncate text-sm font-semibold text-ink">{upload.filename}</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      上传 {formatDateTimeToMinute(upload.createdAt)}
                      {upload.completedAt ? ` · 完成 ${formatDateTimeToMinute(upload.completedAt)}` : ""}
                    </p>
                    <p className="mt-2 text-sm text-slate-700">
                      已登记 {upload.parsedMistakeCount} 道错题
                      {upload.needsReviewCount > 0 ? ` · ${upload.needsReviewCount} 道需人工复核` : ""}
                    </p>
                    {upload.errorMessage ? (
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-red-700">{upload.errorMessage}</p>
                    ) : null}
                  </div>
                  <div className="flex justify-end">
                    {upload.canRetry && upload.jobId ? (
                      <button
                        type="button"
                        onClick={() => toggleJob(upload.jobId as string)}
                        className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        {checked ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                        选择
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">{upload.kind === "single" ? "可重新上传" : "无需重跑"}</span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
