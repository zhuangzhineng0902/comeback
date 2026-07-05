import Link from "next/link";
import React from "react";

import { SeverityBadge } from "@/components/SeverityBadge";
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
  return `/gaps?grade=${encodeURIComponent(grade)}&subject=${encodeURIComponent(subject)}`;
}

export default async function GapsPage({
  searchParams
}: {
  searchParams: Promise<{ grade?: string; subject?: string }>;
}) {
  const params = await searchParams;
  const grade = normalizeGrade(params.grade);
  const subject = normalizeSubject(params.subject);
  const gaps = await prisma.knowledgeGap.findMany({
    where: {
      studentId: "default-student",
      knowledgePoint: {
        grade,
        subject,
        archetypes: {
          some: {
            mistakeArchetypes: {
              some: {
                mistake: activeMistakeWhere({ studentId: "default-student" })
              }
            }
          }
        }
      }
    },
    include: { knowledgePoint: true },
    orderBy: [{ severityRank: "desc" }, { lastOccurredAt: "desc" }]
  });
  const gapsByChapter = gaps.reduce<Array<{ chapter: string; gaps: typeof gaps }>>((groups, gap) => {
    const chapter = gap.knowledgePoint.chapter;
    const group = groups.find((item) => item.chapter === chapter);
    if (group) {
      group.gaps.push(gap);
    } else {
      groups.push({ chapter, gaps: [gap] });
    }
    return groups;
  }, []);

  return (
    <section>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">知识漏洞</h1>
          <p className="mt-2 text-sm text-slate-600">当前范围：{grade} · {subject}</p>
        </div>
        <div className="text-sm text-slate-600 sm:text-right">
          <p>按年级和学科单独查看。</p>
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

      <div className="mt-5 grid gap-3">
        {gaps.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
            当前分类下还没有知识漏洞。上传错题后，我会自动汇总。
          </p>
        ) : (
          gapsByChapter.map((group) => (
            <section key={group.chapter} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="text-xs font-medium text-slate-500">章节</p>
                  <h2 className="mt-1 text-lg font-semibold text-ink">{group.chapter}</h2>
                </div>
                <p className="text-sm text-slate-500">{group.gaps.length} 个漏洞</p>
              </div>
              <div className="mt-3 grid gap-3">
                {group.gaps.map((gap) => (
                  <Link
                    key={gap.id}
                    href={`/knowledge-points/${gap.knowledgePoint.id}`}
                    className="block rounded-md border border-slate-200 bg-white p-4 hover:border-sky-300"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs text-slate-500">
                          {gap.knowledgePoint.grade} · {gap.knowledgePoint.subject}
                        </p>
                        <h3 className="mt-1 font-semibold text-ink">{gap.knowledgePoint.name}</h3>
                      </div>
                      <SeverityBadge severity={gap.severity} />
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-600">
                      错误 {gap.errorCount} 次，高频母题 {gap.repeatedArchetypeCount} 次。{gap.reviewSuggestion}
                    </p>
                    <span className="mt-3 inline-flex rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700">
                      查看知识点详情
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </section>
  );
}
