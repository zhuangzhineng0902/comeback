import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { activeMistakeWhere } from "@/lib/review-status";
import { grades, subjects, type Grade, type Subject } from "@/lib/types";

function normalizeGrade(value: string | null): Grade | undefined {
  return grades.includes(value as Grade) ? (value as Grade) : undefined;
}

function normalizeSubject(value: string | null): Subject | undefined {
  return subjects.includes(value as Subject) ? (value as Subject) : undefined;
}

export async function GET(request?: Request) {
  const url = request ? new URL(request.url) : null;
  const grade = normalizeGrade(url?.searchParams.get("grade") ?? null);
  const subject = normalizeSubject(url?.searchParams.get("subject") ?? null);
  const gaps = await prisma.knowledgeGap.findMany({
    where: {
      studentId: "default-student",
      knowledgePoint: {
        ...(grade ? { grade } : {}),
        ...(subject ? { subject } : {}),
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
