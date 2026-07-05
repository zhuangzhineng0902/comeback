import React from "react";

import { RichExplanationCard } from "@/components/RichExplanationCard";
import type { AnalysisOutput, GapSeverity, GradingEvidence, GradingMarkType, MistakeJudgement } from "@/lib/types";

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

const judgementCopy: Record<MistakeJudgement, { label: string; className: string }> = {
  wrong: { label: "明确错误", className: "border-red-200 bg-red-50 text-red-700" },
  partial: { label: "半对/部分得分", className: "border-amber-200 bg-amber-50 text-amber-800" },
  suspected: { label: "疑似错题", className: "border-orange-200 bg-orange-50 text-orange-800" },
  correct: { label: "疑似已对", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  unknown: { label: "待判断", className: "border-slate-200 bg-slate-50 text-slate-700" }
};

const markTypeCopy: Record<GradingMarkType, string> = {
  check: "老师打勾",
  cross: "老师打叉",
  partial: "半勾/半对",
  deduction: "扣分标记",
  circle: "圈画标记",
  question: "问号标记",
  none: "未见批改",
  unknown: "批改不清"
};

function formatConfidence(value: number) {
  return `${Math.round(value * 100)}%`;
}

function GradingEvidencePanel({ evidence }: { evidence: GradingEvidence }) {
  const judgement = judgementCopy[evidence.judgement];

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-medium text-amber-800">判定依据</p>
        <span className={`rounded-md border px-2 py-1 text-xs font-medium ${judgement.className}`}>
          {judgement.label}
        </span>
        {evidence.isPartialCredit ? (
          <span className="rounded-md border border-amber-300 bg-white px-2 py-1 text-xs font-medium text-amber-800">
            半对/部分得分
          </span>
        ) : null}
        {evidence.needsConfirmation ? (
          <span className="rounded-md border border-orange-300 bg-white px-2 py-1 text-xs font-medium text-orange-800">
            需人工确认
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-sm leading-6 text-amber-950">{evidence.evidenceSummary}</p>
      <dl className="mt-3 grid gap-2 text-xs text-amber-900 sm:grid-cols-2">
        <div>
          <dt className="font-medium">批改标记</dt>
          <dd>{markTypeCopy[evidence.markType]}{evidence.markText ? `：${evidence.markText}` : ""}</dd>
        </div>
        <div>
          <dt className="font-medium">置信度</dt>
          <dd>
            批改 {formatConfidence(evidence.teacherMarkConfidence)} · 答案对比{" "}
            {formatConfidence(evidence.answerMatchConfidence)}
          </dd>
        </div>
        {typeof evidence.deductedScore === "number" ? (
          <div>
            <dt className="font-medium">扣分</dt>
            <dd>{evidence.deductedScore} 分</dd>
          </div>
        ) : null}
        {evidence.studentAnswerLocation ? (
          <div>
            <dt className="font-medium">答案位置</dt>
            <dd>{evidence.studentAnswerLocation}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

export function AnalysisCard({ analysis, gapSeverity, mode }: AnalysisCardProps) {
  const severity = severityCopy[gapSeverity];

  return (
    <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
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

      <div className="mt-5 grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="min-w-0 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-ink">{analysis.questionType}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">{analysis.recognizedText}</p>
          </div>

          {analysis.gradingEvidence ? <GradingEvidencePanel evidence={analysis.gradingEvidence} /> : null}

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

          {analysis.richExplanation ? (
            <RichExplanationCard explanation={analysis.richExplanation} />
          ) : (
            <div className="rounded-md border border-sky-200 bg-sky-50 p-4">
              <p className="text-xs font-medium text-sky-700">讲给孩子听</p>
              <p className="mt-2 text-sm leading-6 text-sky-950">{analysis.studentFriendlyExplanation}</p>
              <p className="mt-3 text-sm leading-6 text-sky-900">{analysis.example}</p>
            </div>
          )}
        </section>

        <aside className="min-w-0 space-y-4">
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
