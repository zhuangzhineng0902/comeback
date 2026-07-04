import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const gaps = await prisma.knowledgeGap.findMany({
    where: { studentId: "default-student" },
    include: { knowledgePoint: true },
    orderBy: [{ severityRank: "desc" }, { lastOccurredAt: "desc" }]
  });

  return NextResponse.json({ gaps });
}
