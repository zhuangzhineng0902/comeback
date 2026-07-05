import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildKnowledgeTree } from "@/lib/knowledge/tree";
import { activeMistakeWhere } from "@/lib/review-status";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const grade = searchParams.get("grade") ?? "八年级";
  const subject = searchParams.get("subject") ?? "数学";

  const points = await prisma.knowledgePoint.findMany({
    where: { grade, subject },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
  });
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
    }
  });

  return NextResponse.json({
    grade,
    subject,
    tree: buildKnowledgeTree({ points, gaps })
  });
}
