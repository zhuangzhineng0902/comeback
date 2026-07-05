import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { activeMistakeWhere } from "@/lib/review-status";

export async function GET() {
  const gaps = await prisma.knowledgeGap.findMany({
    where: {
      studentId: "default-student",
      knowledgePoint: {
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

  return NextResponse.json({ gaps });
}
