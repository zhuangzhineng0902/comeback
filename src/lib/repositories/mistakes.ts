import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { calculateGapSeverity, getGapSeverityRank } from "@/lib/knowledge/severity";
import { activeMistakeReviewWhere } from "@/lib/review-status";
import type { AnalysisOutput } from "@/lib/types";

export type SaveAnalysisInput = {
  studentId: string;
  imagePath: string;
  analysis: AnalysisOutput;
};

function normalizeQuestionText(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[，。！？；：、,.!?;:()[\]（）【】{}<>《》"'“”‘’]/g, "");
}

function questionTextBigrams(value: string) {
  const normalized = normalizeQuestionText(value);
  if (normalized.length < 2) return normalized ? [normalized] : [];
  return Array.from({ length: normalized.length - 1 }, (_, index) => normalized.slice(index, index + 2));
}

export function questionTextSimilarity(left: string, right: string) {
  const leftNormalized = normalizeQuestionText(left);
  const rightNormalized = normalizeQuestionText(right);
  if (leftNormalized === rightNormalized) return 1;
  if (!leftNormalized || !rightNormalized) return 0;

  const leftTokens = questionTextBigrams(left);
  const rightTokens = questionTextBigrams(right);
  const rightCounts = new Map<string, number>();
  for (const token of rightTokens) rightCounts.set(token, (rightCounts.get(token) ?? 0) + 1);
  let overlap = 0;
  for (const token of leftTokens) {
    const count = rightCounts.get(token) ?? 0;
    if (count > 0) {
      overlap += 1;
      rightCounts.set(token, count - 1);
    }
  }
  return (2 * overlap) / (leftTokens.length + rightTokens.length);
}

function reviewStateForAnalysis(analysis: AnalysisOutput) {
  const judgement = analysis.gradingEvidence?.judgement ?? "unknown";
  const needsManualReview =
    analysis.gradingEvidence?.needsConfirmation === true ||
    judgement === "suspected" ||
    judgement === "unknown";

  return {
    aiJudgement: judgement,
    needsManualReview,
    reviewStatus: needsManualReview ? "pending" : "not_required"
  };
}

async function recalculateKnowledgeGap(tx: Prisma.TransactionClient, input: {
  studentId: string;
  knowledgePointId: string;
  latestReason?: string;
}) {
  const activeMistakeWhere = {
    studentId: input.studentId,
    ...activeMistakeReviewWhere,
    mistakeArchetypes: {
      some: {
        archetype: {
          knowledgePointId: input.knowledgePointId
        }
      }
    }
  };

  const errorCount = await tx.mistake.count({ where: activeMistakeWhere });
  const archetypeCounts = await tx.mistakeArchetype.groupBy({
    by: ["archetypeId"],
    where: {
      mistake: activeMistakeWhere
    },
    _count: { archetypeId: true }
  });
  const repeatedArchetypeCount = archetypeCounts.reduce(
    (max, item) => Math.max(max, item._count.archetypeId),
    0
  );
  const severity = calculateGapSeverity({ errorCount, repeatedArchetypeCount });
  const severityRank = getGapSeverityRank(severity);
  const reviewSuggestion =
    severity === "repeated_archetype"
      ? "优先复习这类母题，先按模板做 3 道变式题。"
      : "先回看错因，再完成一组相似练习。";

  const existing = await tx.knowledgeGap.findUnique({
    where: {
      studentId_knowledgePointId: {
        studentId: input.studentId,
        knowledgePointId: input.knowledgePointId
      }
    }
  });

  if (errorCount === 0) {
    if (existing) {
      await tx.knowledgeGap.delete({ where: { id: existing.id } });
    }
    return null;
  }

  return tx.knowledgeGap.upsert({
    where: {
      studentId_knowledgePointId: {
        studentId: input.studentId,
        knowledgePointId: input.knowledgePointId
      }
    },
    update: {
      errorCount,
      relatedMistakeCount: errorCount,
      repeatedArchetypeCount,
      severity,
      severityRank,
      typicalReasons: JSON.stringify(input.latestReason ? [input.latestReason] : []),
      lastOccurredAt: new Date(),
      reviewSuggestion
    },
    create: {
      studentId: input.studentId,
      knowledgePointId: input.knowledgePointId,
      errorCount,
      relatedMistakeCount: errorCount,
      repeatedArchetypeCount,
      severity,
      severityRank,
      typicalReasons: JSON.stringify(input.latestReason ? [input.latestReason] : []),
      lastOccurredAt: new Date(),
      masteryLevel: 0,
      reviewSuggestion
    }
  });
}

export async function saveAnalysisAsMistake(input: SaveAnalysisInput) {
  return prisma.$transaction(async (tx) => {
    // MVP: persist the primary detected knowledge point for each analyzed mistake.
    const pointName = input.analysis.knowledgePoints[0]?.name ?? "待确认知识点";

    const knowledgePoint = await tx.knowledgePoint.upsert({
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

    const archetype = await tx.archetype.upsert({
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

    const normalizedQuestion = normalizeQuestionText(input.analysis.recognizedText);
    const reviewState = reviewStateForAnalysis(input.analysis);
    const existingMistakes = await tx.mistake.findMany({
      where: {
        studentId: input.studentId,
        subject: input.analysis.subject,
        grade: input.analysis.grade
      },
      include: {
        mistakeArchetypes: {
          include: {
            archetype: true
          }
        },
        tutorMessages: true
      }
    });
    const exactDuplicate = existingMistakes.find(
      (mistake) => normalizeQuestionText(mistake.recognizedText) === normalizedQuestion
    );
    const reviewedDuplicate = existingMistakes
      .filter((mistake) => mistake.reviewStatus === "confirmed_wrong" || mistake.reviewStatus === "not_wrong")
      .filter((mistake) => mistake.mistakeArchetypes.some(
        (relation) => relation.archetype.knowledgePointId === knowledgePoint.id
      ))
      .map((mistake) => ({ mistake, similarity: questionTextSimilarity(mistake.recognizedText, input.analysis.recognizedText) }))
      .filter((item) => item.similarity >= 0.82)
      .sort((left, right) => right.similarity - left.similarity)[0]?.mistake;
    const duplicateMistake = exactDuplicate ?? reviewedDuplicate;

    if (duplicateMistake) {
      const existingGap = await tx.knowledgeGap.findUnique({
        where: {
          studentId_knowledgePointId: {
            studentId: input.studentId,
            knowledgePointId: knowledgePoint.id
          }
        }
      });

      return {
        mistake: duplicateMistake,
        gap: existingGap ?? {
          id: "manual-review-no-gap",
          studentId: input.studentId,
          knowledgePointId: knowledgePoint.id,
          errorCount: 0,
          relatedMistakeCount: 0,
          repeatedArchetypeCount: 0,
          severity: "normal",
          severityRank: 0,
          typicalReasons: "[]",
          lastOccurredAt: null,
          masteryLevel: 0,
          reviewSuggestion: "人工已确认不是错题。"
        },
        knowledgePoint,
        archetype
      };
    }

    const mistake = await tx.mistake.create({
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
        aiJudgement: reviewState.aiJudgement,
        needsManualReview: reviewState.needsManualReview,
        reviewStatus: reviewState.reviewStatus,
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

    if (reviewState.reviewStatus === "pending") {
      return {
        mistake,
        gap: { severity: "normal" },
        knowledgePoint,
        archetype
      };
    }

    const gap = await recalculateKnowledgeGap(tx, {
      studentId: input.studentId,
      knowledgePointId: knowledgePoint.id,
      latestReason: input.analysis.mistakeReason
    });
    if (!gap) {
      throw new Error("Failed to create knowledge gap for saved mistake.");
    }

    return { mistake, gap, knowledgePoint, archetype };
  }, { maxWait: 10_000, timeout: 20_000 });
}

export async function updateMistakeManualReview(input: {
  mistakeId: string;
  studentId: string;
  reviewStatus: "confirmed_wrong" | "not_wrong";
  reviewNote?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const mistake = await tx.mistake.findFirst({
      where: {
        id: input.mistakeId,
        studentId: input.studentId
      },
      include: {
        mistakeArchetypes: {
          include: {
            archetype: true
          }
        }
      }
    });

    if (!mistake) {
      return null;
    }

    const updated = await tx.mistake.update({
      where: { id: mistake.id },
      data: {
        needsManualReview: false,
        reviewStatus: input.reviewStatus,
        reviewNote: input.reviewNote?.trim() || null,
        reviewedAt: new Date(),
        masteryStatus: input.reviewStatus === "not_wrong" ? "mastered" : mistake.masteryStatus
      }
    });

    const pointIds = new Set(mistake.mistakeArchetypes.map((relation) => relation.archetype.knowledgePointId));
    for (const knowledgePointId of pointIds) {
      await recalculateKnowledgeGap(tx, {
        studentId: input.studentId,
        knowledgePointId,
        latestReason: input.reviewStatus === "not_wrong" ? undefined : mistake.mistakeReason
      });
    }

    return updated;
  }, { maxWait: 10_000, timeout: 20_000 });
}
