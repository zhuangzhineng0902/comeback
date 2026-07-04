import { notFound } from "next/navigation";
import React from "react";

import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function parseTraps(value: string) {
  try {
    const traps = JSON.parse(value) as unknown;
    return Array.isArray(traps) ? traps.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export default async function MistakeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const mistake = await prisma.mistake.findFirst({
    where: { id, studentId: "default-student" },
    include: {
      tutorMessages: { orderBy: { createdAt: "asc" } },
      mistakeArchetypes: { include: { archetype: true } }
    }
  });

  if (!mistake) {
    notFound();
  }

  return (
    <article className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-sm text-slate-500">
          {mistake.grade} · {mistake.subject}
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-ink">{mistake.questionType}</h1>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-md border border-slate-200 p-3">
            <h2 className="text-sm font-semibold text-ink">孩子答案</h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">{mistake.studentAnswer}</p>
          </div>
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
            <h2 className="text-sm font-semibold text-emerald-800">正确答案</h2>
            <p className="mt-2 text-sm leading-6 text-emerald-900">{mistake.correctAnswer}</p>
          </div>
        </div>

        <h2 className="mt-5 text-sm font-semibold text-ink">题目文本</h2>
        <p className="mt-2 text-sm leading-6 text-slate-700">{mistake.recognizedText}</p>

        <h2 className="mt-5 text-sm font-semibold text-ink">错因</h2>
        <p className="mt-2 text-sm leading-6 text-slate-700">{mistake.mistakeReason}</p>

        <h2 className="mt-5 text-sm font-semibold text-ink">讲解</h2>
        <p className="mt-2 text-sm leading-6 text-slate-700">{mistake.explanation}</p>
      </section>

      <aside className="space-y-4">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-ink">母题</h2>
          {mistake.mistakeArchetypes.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">这道题还没有归入母题。</p>
          ) : (
            <div className="mt-3 space-y-3">
              {mistake.mistakeArchetypes.map((item) => {
                const traps = parseTraps(item.archetype.commonTraps);
                return (
                  <div key={item.id} className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
                    <p className="font-medium text-ink">{item.archetype.title}</p>
                    <p className="mt-2 leading-6 text-slate-600">{item.archetype.solutionTemplate}</p>
                    {traps.length > 0 ? (
                      <p className="mt-2 leading-6 text-slate-500">常见坑：{traps.join("、")}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-ink">追问记录</h2>
          {mistake.tutorMessages.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">还没有围绕这道题继续提问。</p>
          ) : (
            <div className="mt-3 space-y-2">
              {mistake.tutorMessages.map((message) => (
                <p key={message.id} className="rounded-md bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700">
                  {message.role === "user" ? "学生：" : "老师："}
                  {message.content}
                </p>
              ))}
            </div>
          )}
        </section>
      </aside>
    </article>
  );
}
