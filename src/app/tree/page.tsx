import Link from "next/link";
import React from "react";

import { KnowledgeTreeView } from "@/components/KnowledgeTreeView";
import { prisma } from "@/lib/db";
import { buildKnowledgeTree } from "@/lib/knowledge/tree";
import { grades, subjects, type Grade, type Subject } from "@/lib/types";

export const dynamic = "force-dynamic";

function normalizeGrade(value: string | undefined): Grade {
  return grades.includes(value as Grade) ? (value as Grade) : "八年级";
}

function normalizeSubject(value: string | undefined): Subject {
  return subjects.includes(value as Subject) ? (value as Subject) : "数学";
}

function scopeHref(grade: Grade, subject: Subject) {
  return `/tree?grade=${encodeURIComponent(grade)}&subject=${encodeURIComponent(subject)}`;
}

export default async function TreePage({
  searchParams
}: {
  searchParams: Promise<{ grade?: string; subject?: string }>;
}) {
  const params = await searchParams;
  const grade = normalizeGrade(params.grade);
  const subject = normalizeSubject(params.subject);

  const points = await prisma.knowledgePoint.findMany({
    where: { grade, subject },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
  });
  const gaps = await prisma.knowledgeGap.findMany({
    where: { studentId: "default-student", knowledgePoint: { grade, subject } }
  });
  const tree = buildKnowledgeTree({ points, gaps });

  return (
    <section>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">期末知识树</h1>
          <p className="mt-2 text-sm text-slate-600">当前范围：{grade} · {subject}</p>
        </div>
        <div className="text-sm text-slate-600 sm:text-right">
          <p>每个年级和学科单独成树。</p>
          <p>高频母题会被重点标记。</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <p className="text-xs font-medium text-slate-500">年级</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {grades.map((item) => (
              <Link
                key={item}
                href={scopeHref(item, subject)}
                className={`rounded-md px-3 py-2 text-sm ${
                  item === grade ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {item}
              </Link>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-slate-500">学科</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {subjects.map((item) => (
              <Link
                key={item}
                href={scopeHref(grade, item)}
                className={`rounded-md px-3 py-2 text-sm ${
                  item === subject ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {item}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5">
        <KnowledgeTreeView tree={tree} />
      </div>
    </section>
  );
}
