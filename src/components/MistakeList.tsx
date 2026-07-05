import Link from "next/link";
import React from "react";
import { formatDateTimeToMinute } from "@/lib/date-format";

type MistakeSummary = {
  id: string;
  subject: string;
  grade: string;
  questionType: string;
  mistakeReason: string;
  masteryStatus: string;
  createdAt: string | Date;
};

export type MistakeCategory = {
  id: string;
  name: string;
  chapter: string;
  mistakes: MistakeSummary[];
};

const masteryLabels: Record<string, string> = {
  new: "新错题",
  reviewing: "复习中",
  mastered: "已掌握"
};

function MistakeItem({ mistake }: { mistake: MistakeSummary }) {
  return (
    <Link
      href={`/mistakes/${mistake.id}`}
      className="block rounded-md border border-slate-200 bg-white p-4 transition hover:border-slate-400"
    >
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>{mistake.grade}</span>
        <span>{mistake.subject}</span>
        <span>{formatDateTimeToMinute(mistake.createdAt)}</span>
        <span>{masteryLabels[mistake.masteryStatus] ?? masteryLabels.new}</span>
      </div>
      <h2 className="mt-2 font-semibold text-ink">{mistake.questionType}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{mistake.mistakeReason}</p>
    </Link>
  );
}

export function MistakeList({ mistakes, categories }: { mistakes: MistakeSummary[]; categories?: MistakeCategory[] }) {
  if (mistakes.length === 0) {
    return (
      <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
        当前分类下还没有错题。先去 AI 老师页面上传一张照片吧。
      </p>
    );
  }

  if (categories?.length) {
    return (
      <div className="grid gap-4">
        {categories.map((category) => (
          <section key={category.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500">{category.chapter}</p>
                <h2 className="mt-1 text-lg font-semibold text-ink">{category.name}</h2>
              </div>
              <p className="text-sm text-slate-500">{category.mistakes.length} 道错题</p>
            </div>
            <div className="mt-3 grid gap-3">
              {category.mistakes.map((mistake) => (
                <MistakeItem key={mistake.id} mistake={mistake} />
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {mistakes.map((mistake) => (
        <MistakeItem key={mistake.id} mistake={mistake} />
      ))}
    </div>
  );
}
