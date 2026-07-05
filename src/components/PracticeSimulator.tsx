"use client";

import { Printer, RefreshCw } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";

import { grades, subjects, type Grade, type Subject } from "@/lib/types";
import type { PracticeSet } from "@/lib/practice/generator";

async function readJson(response: Response) {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

export function PracticeSimulator() {
  const [subject, setSubject] = useState<Subject | "">("");
  const [grade, setGrade] = useState<Grade | "">("");
  const [count, setCount] = useState(8);
  const [practiceSet, setPracticeSet] = useState<PracticeSet | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("count", String(count));
    if (subject) {
      params.set("subject", subject);
    }
    if (grade) {
      params.set("grade", grade);
    }
    return params.toString();
  }, [count, grade, subject]);

  const generate = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/practice-set?${queryString}`);
      const data = await readJson(response);
      if (!response.ok) {
        setError(typeof data.error === "string" ? data.error : "模拟练习生成失败，请稍后重试。");
        return;
      }
      setPracticeSet(data.practiceSet as PracticeSet);
    } catch {
      setError("网络连接异常，请稍后重试。");
    } finally {
      setIsLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    void generate();
  }, [generate]);

  return (
    <div className="min-w-0 space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm print:hidden sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-ink sm:text-2xl">错题模拟练习</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              根据历史错题关联的母题，生成一批同类变式题，用来复习和打印。
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={generate}
              disabled={isLoading}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 transition hover:border-sky-300 hover:text-sky-700 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              <RefreshCw aria-hidden="true" className={isLoading ? "animate-spin" : ""} size={18} />
              重新生成
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              disabled={!practiceSet || practiceSet.questions.length === 0}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              <Printer aria-hidden="true" size={18} />
              打印 / 另存 PDF
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_160px_160px_140px]">
          <label className="text-sm font-medium text-slate-700">
            学科
            <select
              value={subject}
              onChange={(event) => setSubject(event.target.value as Subject | "")}
              className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-ink"
            >
              <option value="">全部学科</option>
              {subjects.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            年级
            <select
              value={grade}
              onChange={(event) => setGrade(event.target.value as Grade | "")}
              className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-ink"
            >
              <option value="">全部年级</option>
              {grades.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            题量
            <input
              type="number"
              min={4}
              max={24}
              value={count}
              onChange={(event) => setCount(Math.min(Math.max(Number(event.target.value), 4), 24))}
              className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-ink"
            />
          </label>
        </div>

        {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
      </section>

      <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm print:border-0 print:p-0 print:shadow-none sm:p-6">
        {isLoading && !practiceSet ? (
          <p className="text-sm text-slate-600">正在根据错题母题生成练习...</p>
        ) : null}

        {practiceSet && practiceSet.questions.length > 0 ? (
          <div className="min-w-0">
            <div className="border-b border-slate-200 pb-4 print:pb-3">
              <p className="text-sm text-slate-500">{formatDate(practiceSet.createdAt)}</p>
              <h2 className="mt-1 text-2xl font-semibold text-ink print:text-xl">{practiceSet.title}</h2>
              <p className="mt-2 text-sm text-slate-600">
                来源：{practiceSet.sourceMistakeCount} 道历史错题，{practiceSet.sourceArchetypeCount} 个母题。
              </p>
            </div>

            <div className="mt-5 grid gap-4">
              {practiceSet.questions.map((question, index) => (
                <article key={question.id} className="break-inside-avoid rounded-md border border-slate-200 p-4 print:border-slate-300">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>第 {index + 1} 题</span>
                    <span>{question.grade}</span>
                    <span>{question.subject}</span>
                    <span>{question.knowledgePointName}</span>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-base leading-7 text-ink">{question.stem}</p>
                  {question.options ? (
                    <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-3 print:grid-cols-3">
                      {question.options.map((option) => (
                        <span key={option}>{option}</span>
                      ))}
                    </div>
                  ) : null}
                  <p className="mt-4 text-sm text-slate-500 print:hidden">提示：{question.hint}</p>
                </article>
              ))}
            </div>

            <div className="mt-8 break-before-page rounded-md border border-slate-200 bg-slate-50 p-4 print:mt-6 print:border-slate-300 print:bg-white">
              <h2 className="text-lg font-semibold text-ink">答案与解析</h2>
              <div className="mt-4 grid gap-3">
                {practiceSet.questions.map((question, index) => (
                  <div key={`${question.id}-answer`} className="break-inside-avoid text-sm leading-6 text-slate-700">
                    <p className="font-medium text-ink">
                      {index + 1}. {question.answer}
                    </p>
                    <p className="mt-1">解析：{question.solution}</p>
                    <p className="mt-1 text-amber-800">避坑：{question.trapFocus}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {practiceSet && practiceSet.questions.length === 0 ? (
          <div className="rounded-md bg-slate-50 p-4 text-sm leading-6 text-slate-600 print:hidden">
            还没有可用于模拟的历史错题。先在 AI 老师页面上传并分析错题，我会自动沉淀母题，再生成同类练习。
          </div>
        ) : null}
      </section>
    </div>
  );
}
