import path from "node:path";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { updateMistakeManualReview } from "@/lib/repositories/mistakes";

const STUDENT_ID = "default-student";

function imageUrl(imagePath: string) {
  return `/api/uploads/${encodeURIComponent(path.basename(imagePath))}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? "pending";

  const mistakes = await prisma.mistake.findMany({
    where: {
      studentId: STUDENT_ID,
      ...(status === "all"
        ? { needsManualReview: true }
        : status === "reviewed"
          ? { reviewStatus: { in: ["confirmed_wrong", "not_wrong"] } }
          : { reviewStatus: "pending" })
    },
    include: {
      mistakeArchetypes: {
        include: {
          archetype: {
            include: {
              knowledgePoint: true
            }
          }
        }
      }
    },
    orderBy: { createdAt: "desc" },
    take: 80
  });

  return NextResponse.json({
    mistakes: mistakes.map((mistake) => ({
      id: mistake.id,
      subject: mistake.subject,
      grade: mistake.grade,
      questionType: mistake.questionType,
      recognizedText: mistake.recognizedText,
      studentAnswer: mistake.studentAnswer,
      correctAnswer: mistake.correctAnswer,
      mistakeReason: mistake.mistakeReason,
      aiJudgement: mistake.aiJudgement,
      needsManualReview: mistake.needsManualReview,
      reviewStatus: mistake.reviewStatus,
      reviewNote: mistake.reviewNote,
      reviewedAt: mistake.reviewedAt?.toISOString() ?? null,
      createdAt: mistake.createdAt.toISOString(),
      imageUrl: imageUrl(mistake.imagePath),
      archetypes: mistake.mistakeArchetypes.map((relation) => ({
        id: relation.archetype.id,
        title: relation.archetype.title,
        knowledgePointName: relation.archetype.knowledgePoint.name
      }))
    }))
  });
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const mistakeId = typeof body.mistakeId === "string" ? body.mistakeId : "";
  const reviewStatus = typeof body.reviewStatus === "string" ? body.reviewStatus : "";
  const reviewNote = typeof body.reviewNote === "string" ? body.reviewNote : undefined;

  if (!mistakeId) {
    return NextResponse.json({ error: "缺少错题 ID。" }, { status: 400 });
  }

  if (reviewStatus !== "confirmed_wrong" && reviewStatus !== "not_wrong") {
    return NextResponse.json({ error: "复核结果只能是确认错题或不是错题。" }, { status: 400 });
  }

  const updated = await updateMistakeManualReview({
    mistakeId,
    studentId: STUDENT_ID,
    reviewStatus,
    reviewNote
  });

  if (!updated) {
    return NextResponse.json({ error: "错题不存在。" }, { status: 404 });
  }

  return NextResponse.json({
    mistake: {
      id: updated.id,
      reviewStatus: updated.reviewStatus,
      needsManualReview: updated.needsManualReview,
      reviewNote: updated.reviewNote,
      reviewedAt: updated.reviewedAt?.toISOString() ?? null
    }
  });
}
