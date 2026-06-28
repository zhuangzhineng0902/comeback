"use client";

import { LoaderCircle, Send, Upload } from "lucide-react";
import React, { useState } from "react";

import { AnalysisCard } from "@/components/AnalysisCard";
import { grades, subjects, type AnalysisOutput, type GapSeverity, type Grade, type Subject } from "@/lib/types";

type AnalyzeResponse = {
  mode: "api" | "simulation";
  analysis: AnalysisOutput;
  mistakeId: string;
  gapSeverity: GapSeverity;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const defaultAssistantMessage = "先上传一张错题照片，我会把错因、知识点和母题整理出来。";

async function readJson(response: Response) {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function PhotoUploadTutor() {
  const [file, setFile] = useState<File | null>(null);
  const [subjectHint, setSubjectHint] = useState<Subject>("数学");
  const [gradeHint, setGradeHint] = useState<Grade>("八年级");
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: defaultAssistantMessage }
  ]);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isChatting, setIsChatting] = useState(false);

  async function analyze() {
    if (!file) {
      setError("请先选择一张错题照片。");
      return;
    }

    setError("");
    setIsAnalyzing(true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("subjectHint", subjectHint);
    formData.append("gradeHint", gradeHint);

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
      setResult(nextResult);
      setMessages([
        {
          role: "assistant",
          content: `我已经登记这道${nextResult.analysis.subject}错题，重点看「${nextResult.analysis.knowledgePoints[0]?.name ?? nextResult.analysis.questionType}」。`
        }
      ]);
    } catch {
      setError("网络连接异常，请稍后重试。");
    } finally {
      setIsAnalyzing(false);
    }
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
              <span className="mt-1 text-xs text-slate-500">{file ? file.name : "JPG、PNG、WebP 或 HEIC，最大 8MB"}</span>
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>

            <label className="text-sm font-medium text-slate-700">
              学科
              <select
                value={subjectHint}
                onChange={(event) => setSubjectHint(event.target.value as Subject)}
                className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-ink"
              >
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
                onChange={(event) => setGradeHint(event.target.value as Grade)}
                className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-ink"
              >
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
          <AnalysisCard analysis={result.analysis} gapSeverity={result.gapSeverity} mode={result.mode} />
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-600 shadow-sm">
            上传后会在这里看到题目识别、错因、孩子版讲解、母题模板和练习题。
          </div>
        )}
      </section>

      <aside className="flex min-h-[520px] flex-col rounded-lg border border-slate-200 bg-white shadow-sm">
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
  );
}
