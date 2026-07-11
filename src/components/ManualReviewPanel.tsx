"use client";

import { CalendarClock, CheckCircle2, RefreshCw, X, XCircle } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";

import { formatDateTimeToMinute } from "@/lib/date-format";

type ReviewMistake = {
  id: string;
  subject: string;
  grade: string;
  questionType: string;
  recognizedText: string;
  studentAnswer: string;
  correctAnswer: string;
  mistakeReason: string;
  aiJudgement: string;
  reviewStatus: string;
  createdAt: string;
  reviewedAt: string | null;
  contentStatus: string;
  contentError?: string | null;
  imageUrl: string;
  archetypes: Array<{ id: string; title: string; knowledgePointName: string }>;
};

async function readJson(response: Response) {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

const judgementLabels: Record<string, string> = {
  wrong: "明确错误",
  partial: "半对/部分得分",
  suspected: "疑似错题",
  correct: "疑似已对",
  unknown: "待判断"
};

export function ManualReviewPanel() {
  const [mistakes, setMistakes] = useState<ReviewMistake[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState("");
  const [error, setError] = useState("");
  const [reviewFilter, setReviewFilter] = useState<"pending" | "reviewed">("pending");
  const [viewingImage, setViewingImage] = useState<{ url: string; alt: string } | null>(null);

  const loadMistakes = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/review-mistakes?status=${reviewFilter}`);
      const data = await readJson(response);
      if (!response.ok) {
        setError(typeof data.error === "string" ? data.error : "待复核错题加载失败。");
        return;
      }
      setMistakes(Array.isArray(data.mistakes) ? (data.mistakes as ReviewMistake[]) : []);
    } catch {
      setError("网络连接异常，请稍后重试。");
    } finally {
      setIsLoading(false);
    }
  }, [reviewFilter]);

  async function submitReview(mistakeId: string, reviewStatus: "confirmed_wrong" | "not_wrong") {
    setUpdatingId(mistakeId);
    setError("");
    try {
      const response = await fetch("/api/review-mistakes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mistakeId, reviewStatus })
      });
      const data = await readJson(response);
      if (!response.ok) {
        setError(typeof data.error === "string" ? data.error : "复核结果保存失败。");
        return;
      }
      setMistakes((current) => current.filter((mistake) => mistake.id !== mistakeId));
    } catch {
      setError("网络连接异常，复核结果未保存。");
    } finally {
      setUpdatingId("");
    }
  }

  useEffect(() => {
    void loadMistakes();
  }, [loadMistakes]);

  return (
    <div className="min-w-0 space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-ink sm:text-2xl">人工复核</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              这里集中处理 AI 标记为疑似或待判断的题目。确认错题后可进入模拟练习；标记为不是错题后会从漏洞统计和模拟来源中排除。
            </p>
          </div>
          <button
            type="button"
            onClick={loadMistakes}
            disabled={isLoading}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 transition hover:border-sky-300 hover:text-sky-700 disabled:cursor-not-allowed disabled:text-slate-400"
          >
            <RefreshCw aria-hidden="true" className={isLoading ? "animate-spin" : ""} size={18} />
            刷新
          </button>
        </div>
        {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
        <div className="mt-4 inline-flex w-full rounded-md border border-slate-300 bg-slate-50 p-1 sm:w-auto" role="tablist" aria-label="复核状态">
          <button
            type="button"
            role="tab"
            aria-selected={reviewFilter === "pending"}
            onClick={() => setReviewFilter("pending")}
            className={`h-9 flex-1 rounded px-4 text-sm font-medium transition sm:flex-none ${reviewFilter === "pending" ? "bg-white text-ink shadow-sm" : "text-slate-600 hover:text-ink"}`}
          >
            待处理
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={reviewFilter === "reviewed"}
            onClick={() => setReviewFilter("reviewed")}
            className={`h-9 flex-1 rounded px-4 text-sm font-medium transition sm:flex-none ${reviewFilter === "reviewed" ? "bg-white text-ink shadow-sm" : "text-slate-600 hover:text-ink"}`}
          >
            已处理
          </button>
        </div>
      </section>

      {isLoading ? (
        <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
          正在加载待复核题目...
        </p>
      ) : null}

      {!isLoading && mistakes.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
          {reviewFilter === "pending" ? "当前没有待人工复核的题目。" : "当前没有已处理的复核记录。"}
        </p>
      ) : null}

      <div className="grid gap-4">
        {mistakes.map((mistake) => (
          <article key={mistake.id} className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="grid min-w-0 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
              <div className="min-w-0">
                <button
                  type="button"
                  aria-label={`查看 ${mistake.questionType} 原图`}
                  onClick={() => setViewingImage({ url: mistake.imageUrl, alt: `${mistake.questionType} 原图` })}
                  className="group block w-full overflow-hidden rounded-md border border-slate-200 bg-slate-50 text-left transition hover:border-slate-400"
                >
                  <img
                    src={mistake.imageUrl}
                    alt={`${mistake.questionType} 原图`}
                    className="h-auto max-h-72 w-full object-contain"
                  />
                </button>
                <p className="mt-2 text-xs text-slate-500">点击图片查看原图</p>
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>{mistake.grade}</span>
                  <span>{mistake.subject}</span>
                  <span className="rounded-md border border-orange-200 bg-orange-50 px-2 py-1 text-orange-800">
                    AI：{judgementLabels[mistake.aiJudgement] ?? judgementLabels.unknown}
                  </span>
                  {reviewFilter === "reviewed" ? (
                    <>
                      <span className={`rounded-md border px-2 py-1 ${mistake.reviewStatus === "confirmed_wrong" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
                        {mistake.reviewStatus === "confirmed_wrong" ? "已确认为错题" : "已标记非错题"}
                      </span>
                      {mistake.reviewStatus === "confirmed_wrong" ? (
                        <span className={`rounded-md border px-2 py-1 ${mistake.contentStatus === "complete" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : mistake.contentStatus === "failed" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                          {mistake.contentStatus === "complete" ? "解析已完整" : mistake.contentStatus === "failed" ? "补全失败" : "解析补全中"}
                        </span>
                      ) : null}
                    </>
                  ) : null}
                  {mistake.archetypes.slice(0, 2).map((archetype) => (
                    <span key={archetype.id}>{archetype.knowledgePointName}</span>
                  ))}
                </div>
                <h2 className="mt-2 break-words text-lg font-semibold text-ink">{mistake.questionType}</h2>
                <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                  <CalendarClock aria-hidden="true" size={15} />
                  {reviewFilter === "reviewed" && mistake.reviewedAt
                    ? `处理时间：${formatDateTimeToMinute(mistake.reviewedAt)}`
                    : `进入复核：${formatDateTimeToMinute(mistake.createdAt)}`}
                </p>
                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{mistake.recognizedText}</p>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-md border border-slate-200 p-3">
                    <p className="text-xs font-medium text-slate-500">学生答案</p>
                    <p className="mt-1 break-words text-sm leading-6 text-slate-700">{mistake.studentAnswer}</p>
                  </div>
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
                    <p className="text-xs font-medium text-emerald-700">AI 推定正确答案</p>
                    <p className="mt-1 break-words text-sm leading-6 text-emerald-900">{mistake.correctAnswer}</p>
                  </div>
                </div>

                <p className="mt-3 break-words rounded-md border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
                  AI 错因：{mistake.mistakeReason}
                </p>

                {reviewFilter === "pending" ? <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => submitReview(mistake.id, "confirmed_wrong")}
                    disabled={updatingId === mistake.id}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    <CheckCircle2 aria-hidden="true" size={18} />
                    确认为错题
                  </button>
                  <button
                    type="button"
                    onClick={() => submitReview(mistake.id, "not_wrong")}
                    disabled={updatingId === mistake.id}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 transition hover:border-rose-300 hover:text-rose-700 disabled:cursor-not-allowed disabled:text-slate-400"
                  >
                    <XCircle aria-hidden="true" size={18} />
                    不是错题
                  </button>
                </div> : null}
              </div>
            </div>
          </article>
        ))}
      </div>

      {viewingImage ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={viewingImage.alt}
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-4"
          onClick={() => setViewingImage(null)}
        >
          <div
            className="max-h-full w-full max-w-5xl overflow-hidden rounded-lg bg-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <p className="truncate text-sm font-medium text-ink">{viewingImage.alt}</p>
              <button
                type="button"
                aria-label="关闭原图"
                onClick={() => setViewingImage(null)}
                className="grid h-9 w-9 place-items-center rounded-md text-slate-600 transition hover:bg-slate-100 hover:text-ink"
              >
                <X aria-hidden="true" size={18} />
              </button>
            </div>
            <div className="max-h-[calc(100vh-120px)] overflow-auto bg-slate-100 p-3">
              <img src={viewingImage.url} alt={viewingImage.alt} className="mx-auto h-auto max-w-full rounded-md bg-white" />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
