import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import React from "react";

import { RichExplanationCard } from "@/components/RichExplanationCard";
import { SeverityBadge } from "@/components/SeverityBadge";
import { getKnowledgePointDetail } from "@/lib/knowledge/details";

export const dynamic = "force-dynamic";

function imageUrl(imagePath: string) {
  return imagePath.startsWith("uploads/") ? `/api/${imagePath}` : imagePath;
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(value);
}

export default async function KnowledgePointDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getKnowledgePointDetail(id);

  if (!detail) {
    notFound();
  }

  const { knowledgePoint, gap, richExplanation, archetypes, relatedMistakes } = detail;
  const treeHref = `/tree?grade=${encodeURIComponent(knowledgePoint.grade)}&subject=${encodeURIComponent(knowledgePoint.subject)}`;

  return (
    <article className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link href="/gaps" className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-700 hover:border-sky-300">
          知识漏洞
        </Link>
        <Link href={treeHref} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-700 hover:border-sky-300">
          期末知识树
        </Link>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-slate-500">
              {knowledgePoint.grade} · {knowledgePoint.subject} · {knowledgePoint.chapter}
            </p>
            <h1 className="mt-2 min-w-0 break-words text-2xl font-semibold text-ink">{knowledgePoint.name}</h1>
          </div>
          <SeverityBadge severity={gap?.severity ?? "normal"} />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">累计错误</p>
            <p className="mt-1 text-xl font-semibold text-ink">{gap?.errorCount ?? 0} 次</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">高频母题</p>
            <p className="mt-1 text-xl font-semibold text-ink">{gap?.repeatedArchetypeCount ?? 0} 次</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">关联错题</p>
            <p className="mt-1 text-xl font-semibold text-ink">{relatedMistakes.length} 道</p>
          </div>
        </div>

        {gap?.reviewSuggestion ? <p className="mt-4 text-sm leading-6 text-slate-700">{gap.reviewSuggestion}</p> : null}
      </section>

      <RichExplanationCard explanation={richExplanation} />

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-ink">母题讲解</h2>
        {archetypes.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">这个知识点还没有沉淀母题，后续错题分析会自动补充。</p>
        ) : (
          <div className="mt-4 grid gap-3">
            {archetypes.map((archetype) => (
              <article key={archetype.id} className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <h3 className="font-semibold text-ink">{archetype.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-700">题型模式：{archetype.pattern}</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">通用解法：{archetype.solutionTemplate}</p>
                {archetype.commonTraps.length > 0 ? (
                  <p className="mt-2 text-sm leading-6 text-amber-800">常见坑：{archetype.commonTraps.join("、")}</p>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-ink">关联错题</h2>
        {relatedMistakes.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">还没有直接关联到这个知识点的错题。</p>
        ) : (
          <div className="mt-4 grid gap-3">
            {relatedMistakes.map((mistake) => (
              <Link
                key={mistake.id}
                href={`/mistakes/${mistake.id}`}
                className="grid min-w-0 gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 hover:border-sky-300 md:grid-cols-[140px_minmax(0,1fr)]"
              >
                <div className="min-h-24 overflow-hidden rounded-md border border-slate-200 bg-white">
                  {mistake.imagePath ? (
                    <Image
                      src={imageUrl(mistake.imagePath)}
                      alt="错题原图"
                      width={280}
                      height={180}
                      unoptimized
                      className="h-full max-h-32 w-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-slate-500">
                    {formatDate(mistake.createdAt)} · {mistake.grade} · {mistake.subject}
                  </p>
                  <h3 className="mt-1 min-w-0 break-words font-semibold text-ink">{mistake.questionType}</h3>
                  <p className="mt-2 line-clamp-2 min-w-0 break-words text-sm leading-6 text-slate-700">{mistake.recognizedText}</p>
                  <p className="mt-2 min-w-0 break-words text-sm leading-6 text-amber-800">错因：{mistake.mistakeReason}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </article>
  );
}
