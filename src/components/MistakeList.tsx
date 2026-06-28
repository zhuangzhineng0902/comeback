import Link from "next/link";
import React from "react";

type MistakeSummary = {
  id: string;
  subject: string;
  grade: string;
  questionType: string;
  mistakeReason: string;
  masteryStatus: string;
  createdAt: string | Date;
};

const masteryLabels: Record<string, string> = {
  new: "新错题",
  reviewing: "复习中",
  mastered: "已掌握"
};

export function MistakeList({ mistakes }: { mistakes: MistakeSummary[] }) {
  if (mistakes.length === 0) {
    return (
      <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
        还没有错题。先去 AI 老师页面上传一张照片吧。
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      {mistakes.map((mistake) => (
        <Link
          key={mistake.id}
          href={`/mistakes/${mistake.id}`}
          className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-400"
        >
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>{mistake.grade}</span>
            <span>{mistake.subject}</span>
            <span>{new Date(mistake.createdAt).toLocaleDateString("zh-CN")}</span>
            <span>{masteryLabels[mistake.masteryStatus] ?? masteryLabels.new}</span>
          </div>
          <h2 className="mt-2 font-semibold text-ink">{mistake.questionType}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{mistake.mistakeReason}</p>
        </Link>
      ))}
    </div>
  );
}
