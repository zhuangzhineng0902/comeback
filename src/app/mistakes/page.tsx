import React from "react";

import { MistakeList } from "@/components/MistakeList";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function MistakesPage() {
  const mistakes = await prisma.mistake.findMany({
    where: { studentId: "default-student" },
    orderBy: { createdAt: "desc" }
  });

  return (
    <section>
      <h1 className="text-2xl font-semibold text-ink">错题本</h1>
      <p className="mt-2 text-sm text-slate-600">按时间记录所有已经分析的错题。</p>
      <div className="mt-5">
        <MistakeList mistakes={mistakes} />
      </div>
    </section>
  );
}
