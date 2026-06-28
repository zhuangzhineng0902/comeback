import { prisma } from "@/lib/db";
import { calculateGapSeverity, getGapSeverityRank } from "@/lib/knowledge/severity";
import type { AnalysisOutput } from "@/lib/types";

export type SaveAnalysisInput = {
  studentId: string;
  imagePath: string;
  analysis: AnalysisOutput;
};

export async function saveAnalysisAsMistake(input: SaveAnalysisInput) {
  const pointName = input.analysis.knowledgePoints[0]?.name ?? "待确认知识点";

  const knowledgePoint = await prisma.knowledgePoint.upsert({
    where: {
      subject_grade_name: {
        subject: input.analysis.subject,
        grade: input.analysis.grade,
        name: pointName
      }
    },
    update: {},
    create: {
      subject: input.analysis.subject,
      grade: input.analysis.grade,
      name: pointName,
      chapter: "待确认",
      sortOrder: 999
    }
  });

  const archetype = await prisma.archetype.upsert({
    where: {
      subject_grade_knowledgePointId_title: {
        subject: input.analysis.subject,
        grade: input.analysis.grade,
        knowledgePointId: knowledgePoint.id,
        title: input.analysis.archetype.title
      }
    },
    update: {
      pattern: input.analysis.archetype.pattern,
      solutionTemplate: input.analysis.archetype.solutionTemplate,
      commonTraps: JSON.stringify(input.analysis.archetype.commonTraps)
    },
    create: {
      subject: input.analysis.subject,
      grade: input.analysis.grade,
      knowledgePointId: knowledgePoint.id,
      title: input.analysis.archetype.title,
      pattern: input.analysis.archetype.pattern,
      solutionTemplate: input.analysis.archetype.solutionTemplate,
      commonTraps: JSON.stringify(input.analysis.archetype.commonTraps)
    }
  });

  const mistake = await prisma.mistake.create({
    data: {
      studentId: input.studentId,
      imagePath: input.imagePath,
      recognizedText: input.analysis.recognizedText,
      subject: input.analysis.subject,
      grade: input.analysis.grade,
      questionType: input.analysis.questionType,
      studentAnswer: input.analysis.studentAnswer,
      correctAnswer: input.analysis.correctAnswer,
      explanation: input.analysis.studentFriendlyExplanation,
      mistakeReason: input.analysis.mistakeReason,
      masteryStatus: "new",
      mistakeArchetypes: {
        create: {
          archetypeId: archetype.id,
          similarityScore: 0.95
        }
      },
      tutorMessages: {
        create: {
          role: "assistant",
          content: input.analysis.studentFriendlyExplanation
        }
      }
    },
    include: {
      mistakeArchetypes: true,
      tutorMessages: true
    }
  });

  const errorCount = await prisma.mistake.count({
    where: {
      studentId: input.studentId,
      subject: input.analysis.subject,
      grade: input.analysis.grade,
      mistakeArchetypes: {
        some: {
          archetype: {
            knowledgePointId: knowledgePoint.id
          }
        }
      }
    }
  });

  const repeatedArchetypeCount = await prisma.mistakeArchetype.count({
    where: {
      archetypeId: archetype.id,
      mistake: {
        studentId: input.studentId
      }
    }
  });

  const severity = calculateGapSeverity({ errorCount, repeatedArchetypeCount });
  const severityRank = getGapSeverityRank(severity);
  const reviewSuggestion =
    severity === "repeated_archetype"
      ? "优先复习这类母题，先按模板做 3 道变式题。"
      : "先回看错因，再完成一组相似练习。";

  const gap = await prisma.knowledgeGap.upsert({
    where: {
      studentId_knowledgePointId: {
        studentId: input.studentId,
        knowledgePointId: knowledgePoint.id
      }
    },
    update: {
      errorCount,
      relatedMistakeCount: errorCount,
      repeatedArchetypeCount,
      severity,
      severityRank,
      typicalReasons: JSON.stringify([input.analysis.mistakeReason]),
      lastOccurredAt: new Date(),
      reviewSuggestion
    },
    create: {
      studentId: input.studentId,
      knowledgePointId: knowledgePoint.id,
      errorCount,
      relatedMistakeCount: errorCount,
      repeatedArchetypeCount,
      severity,
      severityRank,
      typicalReasons: JSON.stringify([input.analysis.mistakeReason]),
      lastOccurredAt: new Date(),
      masteryLevel: 0,
      reviewSuggestion
    }
  });

  return { mistake, gap, knowledgePoint, archetype };
}
