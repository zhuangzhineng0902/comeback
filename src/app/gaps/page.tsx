import Link from "next/link";
import React from "react";

import { SeverityBadge } from "@/components/SeverityBadge";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function GapsPage() {
  const gaps = await prisma.knowledgeGap.findMany({
    where: { studentId: "default-student" },
    include: { knowledgePoint: true },
    orderBy: [{ severityRank: "desc" }, { lastOccurredAt: "desc" }]
  });

  return (
    <section>
      <h1 className="text-2xl font-semibold text-ink">知识漏洞</h1>
      <p className="mt-2 text-sm text-slate-600">这里会记录反复出错的知识点和高频母题。</p>

      <div className="mt-5 grid gap-3">
        {gaps.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
            还没有知识漏洞。上传错题后，我会自动汇总。
          </p>
        ) : (
          gaps.map((gap) => (
            <Link
              key={gap.id}
              href={`/knowledge-points/${gap.knowledgePoint.id}`}
              className="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-sky-300"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-slate-500">
                    {gap.knowledgePoint.grade} · {gap.knowledgePoint.subject}
                  </p>
                  <h2 className="mt-1 font-semibold text-ink">{gap.knowledgePoint.name}</h2>
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
          ))
        )}
      </div>
    </section>
  );
}
