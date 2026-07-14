import { notFound } from "next/navigation";
import path from "node:path";
import React from "react";

import { MistakeDeleteButton } from "@/components/MistakeDeleteButton";
import { OriginalPhotoViewer } from "@/components/OriginalPhotoViewer";
import { prisma } from "@/lib/db";
import { activeMistakeWhere } from "@/lib/review-status";

export const dynamic = "force-dynamic";

function parseTraps(value: string) {
  try {
    const traps = JSON.parse(value) as unknown;
    return Array.isArray(traps) ? traps.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function uploadedImageUrl(imagePath: string) {
  return `/api/uploads/${encodeURIComponent(path.basename(imagePath))}`;
}

type ContentDetails = {
  knowledgePoints?: string[];
  solutionStrategy?: string;
  examples?: Array<{ label: string; sourceTitle?: string; sourceUrl?: string; question: string; answer: string; explanation: string }>;
};

function parseContentDetails(value: string | null): ContentDetails | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as ContentDetails;
  } catch {
    return null;
  }
}

export default async function MistakeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const mistake = await prisma.mistake.findFirst({
    where: activeMistakeWhere({ id, studentId: "default-student" }),
    include: {
      tutorMessages: { orderBy: { createdAt: "asc" } },
      mistakeArchetypes: { include: { archetype: true } }
    }
  });

  if (!mistake) {
    notFound();
  }

  const originalFilename = path.basename(mistake.imagePath);
  const contentDetails = parseContentDetails(mistake.contentJson);

  return (
    <article className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-5">
      <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="text-sm text-slate-500">
              {mistake.grade} · {mistake.subject}
            </div>
            <h1 className="mt-2 break-words text-xl font-semibold text-ink sm:text-2xl">{mistake.questionType}</h1>
          </div>
          <MistakeDeleteButton
            mistakeId={mistake.id}
            redirectTo={`/mistakes?grade=${encodeURIComponent(mistake.grade)}&subject=${encodeURIComponent(mistake.subject)}`}
          />
        </div>

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

        {contentDetails?.solutionStrategy ? (
          <>
            <h2 className="mt-5 text-sm font-semibold text-ink">通用解题套路</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{contentDetails.solutionStrategy}</p>
          </>
        ) : null}

        {contentDetails?.knowledgePoints?.length ? (
          <div className="mt-5">
            <h2 className="text-sm font-semibold text-ink">相关知识点</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {contentDetails.knowledgePoints.map((point) => <span key={point} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-sm text-slate-700">{point}</span>)}
            </div>
          </div>
        ) : null}

        {contentDetails?.examples?.length ? (
          <div className="mt-5">
            <h2 className="text-sm font-semibold text-ink">母题与深圳题型</h2>
            <div className="mt-3 space-y-3">
              {contentDetails.examples.map((example, index) => (
                <div key={`${example.label}-${index}`} className="rounded-md border border-slate-200 p-3 text-sm">
                  <p className="font-medium text-ink">{example.label}</p>
                  {example.sourceTitle && example.sourceUrl ? <a className="mt-1 block text-teal-700 underline" href={example.sourceUrl} target="_blank" rel="noreferrer">来源：{example.sourceTitle}</a> : null}
                  <p className="mt-2 leading-6 text-slate-700">{example.question}</p>
                  <p className="mt-2 leading-6 text-emerald-800">答案：{example.answer}</p>
                  <p className="mt-1 leading-6 text-slate-600">{example.explanation}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <aside className="min-w-0 space-y-4">
        <OriginalPhotoViewer filename={originalFilename} imageUrl={uploadedImageUrl(mistake.imagePath)} />

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
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

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
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
