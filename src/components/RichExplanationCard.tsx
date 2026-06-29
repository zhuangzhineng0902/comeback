import React from "react";

import { IllustrationRenderer } from "@/components/IllustrationRenderer";
import type { RichExplanation } from "@/lib/types";

type RichExplanationCardProps = {
  explanation: RichExplanation;
};

type TagListProps = {
  label: string;
  items: string[];
};

function TagList({ label, items }: TagListProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <div className="mt-2 flex min-w-0 flex-wrap gap-2">
        {items.map((item, index) => (
          <span
            key={`${item}-${index}`}
            className="min-w-0 max-w-full break-words rounded-md border border-slate-200 bg-white px-2 py-1 text-xs leading-5 text-slate-700"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

export function RichExplanationCard({ explanation }: RichExplanationCardProps) {
  return (
    <div className="min-w-0 space-y-3 rounded-md border border-sky-200 bg-sky-50 p-4">
      <div className="min-w-0">
        <p className="text-xs font-medium text-sky-700">老师板书式讲解</p>
        <p className="mt-2 min-w-0 break-words text-sm leading-6 text-sky-950">{explanation.diagnosis}</p>
        <p className="mt-2 min-w-0 break-words text-sm leading-6 text-sky-900">{explanation.analogy}</p>
      </div>

      <IllustrationRenderer illustration={explanation.illustration} />

      <ol className="space-y-2">
        {explanation.walkthrough.map((step, index) => (
          <li key={`${step.title}-${index}`} className="min-w-0 rounded-md border border-sky-100 bg-white/75 p-3">
            <p className="min-w-0 break-words text-sm font-semibold text-ink">
              {index + 1}. {step.title}
            </p>
            <p className="mt-1 min-w-0 break-words text-sm leading-6 text-slate-700">{step.body}</p>
          </li>
        ))}
      </ol>

      <div className="min-w-0 rounded-md border border-amber-200 bg-amber-50 p-3">
        <p className="text-xs font-medium text-amber-700">错因提醒</p>
        <p className="mt-1 min-w-0 break-words text-sm leading-6 text-amber-950">{explanation.wrongAnswerInsight}</p>
      </div>

      <div className="min-w-0 rounded-md border border-slate-200 bg-white p-3">
        <p className="text-xs font-medium text-slate-500">知识树位置</p>
        <p className="mt-2 min-w-0 break-words text-sm font-semibold leading-6 text-ink">
          {explanation.treeContext.path.join(" → ")}
        </p>
        <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
          <TagList label="前置知识" items={explanation.treeContext.prerequisites} />
          <TagList label="当前叶子" items={explanation.treeContext.current} />
          <TagList label="后续关联" items={explanation.treeContext.next} />
          <TagList label="易混点" items={explanation.treeContext.confusions} />
        </div>
      </div>

      <div className="min-w-0 rounded-md border border-emerald-200 bg-emerald-50 p-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="text-xs font-medium text-emerald-700">深圳题型例子</p>
          <span className="min-w-0 break-words rounded-md border border-emerald-200 bg-white px-2 py-1 text-xs text-emerald-800">
            {explanation.shenzhenExample.label}
          </span>
          {explanation.shenzhenExample.sourceNote ? (
            <span className="min-w-0 break-words rounded-md border border-emerald-200 bg-white px-2 py-1 text-xs text-emerald-800">
              来源：{explanation.shenzhenExample.sourceNote}
            </span>
          ) : null}
        </div>
        <p className="mt-2 min-w-0 break-words text-sm font-semibold leading-6 text-ink">
          {explanation.shenzhenExample.question}
        </p>
        <p className="mt-1 min-w-0 break-words text-sm leading-6 text-emerald-900">
          答案：{explanation.shenzhenExample.answer}
        </p>
        <p className="mt-1 min-w-0 break-words text-sm leading-6 text-emerald-900">
          解析：{explanation.shenzhenExample.explanation}
        </p>
      </div>
    </div>
  );
}
