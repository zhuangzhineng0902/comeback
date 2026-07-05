import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { generatePracticeSet, type PracticeSource } from "@/lib/practice/generator";

const STUDENT_ID = "default-student";

function normalizeCount(value: string | null) {
  const parsed = Number(value ?? 8);
  if (!Number.isFinite(parsed)) {
    return 8;
  }
  return Math.min(Math.max(Math.trunc(parsed), 4), 24);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const subject = searchParams.get("subject");
  const grade = searchParams.get("grade");
  const count = normalizeCount(searchParams.get("count"));

  const mistakes = await prisma.mistake.findMany({
    where: {
      studentId: STUDENT_ID,
      ...(subject ? { subject } : {}),
      ...(grade ? { grade } : {}),
      OR: [
        { needsManualReview: false, reviewStatus: { not: "not_wrong" } },
        { reviewStatus: "confirmed_wrong" }
      ],
      mistakeArchetypes: {
        some: {}
      }
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
    take: 40
  });

  const sources: PracticeSource[] = mistakes.flatMap((mistake) =>
    mistake.mistakeArchetypes.map((relation) => ({
      mistakeId: mistake.id,
      subject: mistake.subject,
      grade: mistake.grade,
      questionType: mistake.questionType,
      recognizedText: mistake.recognizedText,
      mistakeReason: mistake.mistakeReason,
      correctAnswer: mistake.correctAnswer,
      archetype: {
        id: relation.archetype.id,
        title: relation.archetype.title,
        pattern: relation.archetype.pattern,
        solutionTemplate: relation.archetype.solutionTemplate,
        commonTraps: relation.archetype.commonTraps,
        knowledgePoint: {
          name: relation.archetype.knowledgePoint.name,
          chapter: relation.archetype.knowledgePoint.chapter
        }
      }
    }))
  );

  return NextResponse.json({
    practiceSet: generatePracticeSet({ sources, count, subject, grade })
  });
}
