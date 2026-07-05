import Link from "next/link";
import React from "react";

import { MistakeList, type MistakeCategory } from "@/components/MistakeList";
import { prisma } from "@/lib/db";
import { activeMistakeWhere } from "@/lib/review-status";
import { grades, subjects, type Grade, type Subject } from "@/lib/types";

export const dynamic = "force-dynamic";

function normalizeGrade(value: string | undefined): Grade {
  return grades.includes(value as Grade) ? (value as Grade) : "八年级";
}

function normalizeSubject(value: string | undefined): Subject {
  return subjects.includes(value as Subject) ? (value as Subject) : "数学";
}

function scopeHref(grade: Grade, subject: Subject) {
  return `/mistakes?grade=${encodeURIComponent(grade)}&subject=${encodeURIComponent(subject)}`;
}

export default async function MistakesPage({
  searchParams
}: {
  searchParams: Promise<{ grade?: string; subject?: string }>;
}) {
  const params = await searchParams;
  const grade = normalizeGrade(params.grade);
  const subject = normalizeSubject(params.subject);
  const mistakes = await prisma.mistake.findMany({
    where: activeMistakeWhere({ studentId: "default-student", grade, subject }),
    include: {
      mistakeArchetypes: {
        include: {
          archetype: {
            include: {
              knowledgePoint: true
            }
          }
        },
        orderBy: { similarityScore: "desc" }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  const categoryMap = new Map<string, MistakeCategory>();
  for (const mistake of mistakes) {
    const knowledgePoint = mistake.mistakeArchetypes[0]?.archetype.knowledgePoint;
    const categoryId = knowledgePoint?.id ?? `uncategorized-${mistake.grade}-${mistake.subject}`;
    const category = categoryMap.get(categoryId) ?? {
      id: categoryId,
      name: knowledgePoint?.name ?? "未归类错题",
      chapter: knowledgePoint?.chapter ?? `${mistake.grade} · ${mistake.subject}`,
      mistakes: []
    };

    category.mistakes.push(mistake);
    categoryMap.set(categoryId, category);
  }

  const categories = Array.from(categoryMap.values()).sort((left, right) => {
    if (left.chapter !== right.chapter) {
      return left.chapter.localeCompare(right.chapter, "zh-Hans-CN");
    }
    return left.name.localeCompare(right.name, "zh-Hans-CN");
  });

  return (
    <section>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">错题本</h1>
          <p className="mt-2 text-sm text-slate-600">当前范围：{grade} · {subject}</p>
        </div>
        <div className="text-sm text-slate-600 sm:text-right">
          <p>按知识点分类整理错题。</p>
          <p>分类逻辑与期末知识树保持一致。</p>
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
        <MistakeList mistakes={mistakes} categories={categories} />
      </div>
    </section>
  );
}
