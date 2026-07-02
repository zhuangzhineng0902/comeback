"use client";

import { LoaderCircle, Send, Upload, X } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";

import { AnalysisCard } from "@/components/AnalysisCard";
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

type UploadedImage = {
  index: number;
  filename: string;
  url: string;
};

type ImageGroup = {
  image: UploadedImage;
  paperVisionContext?: PaperVisionContext;
  analyses: AnalysisOutput[];
  savedMistakes: Array<{ mistakeId: string; gapSeverity: GapSeverity }>;
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
              savedMistakes:
                result.savedMistakes ?? [{ mistakeId: result.mistakeId, gapSeverity: result.gapSeverity }]
            }
          ]
        : [];

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
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="space-y-5">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-ink">AI 老师</h1>
              <p className="mt-1 text-sm text-slate-600">拍照登记错题，老师会整理错因、漏洞和母题。</p>
            </div>
            <button
              type="button"
              onClick={analyze}
              disabled={isAnalyzing}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
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

        {result ? (
          <div className="space-y-4">
            {resultImageGroups.map((group, groupIndex) => (
              <section
                key={group.image?.url ?? `image-group-${groupIndex}`}
                className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
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
                    <p className="mt-2 text-xs text-slate-500">点击图片查看原图：{group.image.filename}</p>
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
                ) : (
                  <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
                    这张图片没有识别到明确错题。
                  </p>
                )}
              </section>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-600 shadow-sm">
            上传后会在这里看到题目识别、错因、孩子版讲解、母题模板和练习题。
          </div>
        )}
      </section>

      <aside className="flex min-h-[520px] flex-col rounded-lg border border-slate-200 bg-white shadow-sm">
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
                    {entry.createdAt ? ` · ${new Date(entry.createdAt).toLocaleDateString("zh-CN")}` : ""}
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
                  : "ml-8 bg-slate-900 text-white"
              }`}
            >
              {message.content}
            </div>
          ))}
        </div>

        <div className="border-t border-slate-200 p-3">
          <div className="flex gap-2">
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
