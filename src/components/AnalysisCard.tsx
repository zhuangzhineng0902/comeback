import React from "react";

import type { AnalysisOutput, GapSeverity } from "@/lib/types";

type AnalysisCardProps = {
  analysis: AnalysisOutput;
  gapSeverity: GapSeverity;
  mode: "api" | "simulation";
};

const severityCopy: Record<GapSeverity, { label: string; className: string }> = {
  normal: {
    label: "普通错因",
    className: "border-slate-200 bg-slate-50 text-slate-700"
  },
  weak: {
    label: "薄弱点",
    className: "border-amber-200 bg-amber-50 text-amber-800"
  },
  important: {
    label: "重点漏洞",
    className: "border-rose-200 bg-rose-50 text-rose-700"
  },
  repeated_archetype: {
    label: "同类题多次出错",
    className: "border-red-200 bg-red-50 text-red-700"
  }
};

export function AnalysisCard({ analysis, gapSeverity, mode }: AnalysisCardProps) {
  const severity = severityCopy[gapSeverity];

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white">
          {analysis.grade} · {analysis.subject}
        </span>
        <span className={`rounded-md border px-2 py-1 text-xs font-medium ${severity.className}`}>
          {severity.label}
        </span>
        <span className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500">
          {mode === "api" ? "AI 视觉分析" : "模拟分析"}
        </span>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-ink">{analysis.questionType}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">{analysis.recognizedText}</p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-md border border-slate-200 p-3">
              <p className="text-xs font-medium text-slate-500">孩子答案</p>
              <p className="mt-1 text-sm leading-6 text-slate-700">{analysis.studentAnswer}</p>
            </div>
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs font-medium text-emerald-700">正确答案</p>
              <p className="mt-1 text-sm leading-6 text-emerald-900">{analysis.correctAnswer}</p>
            </div>
          </div>

          <div className="rounded-md border border-slate-200 p-4">
            <p className="text-xs font-medium text-slate-500">错因</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">{analysis.mistakeReason}</p>
          </div>

          <div className="rounded-md border border-sky-200 bg-sky-50 p-4">
            <p className="text-xs font-medium text-sky-700">讲给孩子听</p>
            <p className="mt-2 text-sm leading-6 text-sky-950">{analysis.studentFriendlyExplanation}</p>
            <p className="mt-3 text-sm leading-6 text-sky-900">{analysis.example}</p>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-md border border-slate-200 p-4">
            <p className="text-xs font-medium text-slate-500">母题</p>
            <h3 className="mt-2 text-sm font-semibold text-ink">{analysis.archetype.title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-700">{analysis.archetype.pattern}</p>
            <p className="mt-3 text-sm leading-6 text-slate-700">{analysis.archetype.solutionTemplate}</p>
          </div>

          <div className="rounded-md border border-slate-200 p-4">
            <p className="text-xs font-medium text-slate-500">常见坑</p>
            <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-700">
              {analysis.archetype.commonTraps.map((trap) => (
                <li key={trap}>· {trap}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-md border border-slate-200 p-4">
            <p className="text-xs font-medium text-slate-500">举一反三</p>
            <div className="mt-3 space-y-3">
              {analysis.practiceQuestions.map((question) => (
                <div key={question.question} className="text-sm leading-6 text-slate-700">
                  <p className="font-medium text-ink">{question.question}</p>
                  <p className="text-slate-500">提示：{question.hint}</p>
                  <p className="text-emerald-700">答案：{question.answer}</p>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </article>
  );
}
