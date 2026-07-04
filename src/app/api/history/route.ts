import path from "node:path";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import type { AnalysisOutput } from "@/lib/types";

function parseCommonTraps(value?: string) {
  if (!value) {
    return ["回看错因时只记结论，没有复盘完整步骤"];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      const traps = parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
      return traps.length > 0 ? traps : ["回看错因时只记结论，没有复盘完整步骤"];
    }
  } catch {
    return value
      .split(/、|，|,|;|；|\r?\n/g)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return ["回看错因时只记结论，没有复盘完整步骤"];
}

function imageSummary(imagePath: string) {
  const filename = path.basename(imagePath);
  return {
    index: 0,
    filename,
    url: `/api/uploads/${encodeURIComponent(filename)}`
  };
}

export async function GET() {
  const mistakes = await prisma.mistake.findMany({
    where: { studentId: "default-student" },
    include: {
      tutorMessages: { orderBy: { createdAt: "asc" } },
      mistakeArchetypes: { include: { archetype: true } }
    },
    orderBy: { createdAt: "desc" },
    take: 20
  });

  const history = mistakes.map((mistake) => {
    const archetype = mistake.mistakeArchetypes[0]?.archetype;
    const image = imageSummary(mistake.imagePath);
    const analysis: AnalysisOutput = {
      sourceImageIndex: 0,
      subject: mistake.subject as AnalysisOutput["subject"],
      grade: mistake.grade as AnalysisOutput["grade"],
      questionType: mistake.questionType,
      recognizedText: mistake.recognizedText,
      studentAnswer: mistake.studentAnswer,
      correctAnswer: mistake.correctAnswer,
      knowledgePoints: [{ name: archetype?.title ?? mistake.questionType, confidence: 0.8 }],
      mistakeReason: mistake.mistakeReason,
      studentFriendlyExplanation: mistake.explanation,
      example: "从历史记录恢复的错题，可继续追问老师获取更多例子。",
      archetype: {
        title: archetype?.title ?? "历史错题母题",
        pattern: archetype?.pattern ?? "先复盘错因，再按步骤重做。",
        solutionTemplate: archetype?.solutionTemplate ?? mistake.explanation,
        commonTraps: parseCommonTraps(archetype?.commonTraps)
      },
      practiceQuestions: [
        {
          question: "请把这道历史错题遮住答案后重新做一遍。",
          answer: mistake.correctAnswer,
          hint: mistake.mistakeReason
        }
      ]
    };

    return {
      mistakeId: mistake.id,
      mode: "api" as const,
      analysis,
      analyses: [analysis],
      gapSeverity: "normal" as const,
      savedMistakes: [{ mistakeId: mistake.id, gapSeverity: "normal" as const }],
      uploadedImages: [image],
      imageGroups: [
        {
          image,
          analyses: [analysis],
          savedMistakes: [{ mistakeId: mistake.id, gapSeverity: "normal" as const }]
        }
      ],
      messages: mistake.tutorMessages.map((message) => ({
        role: message.role,
        content: message.content,
        createdAt: message.createdAt
      })),
      createdAt: mistake.createdAt
    };
  });

  return NextResponse.json({ history });
}
