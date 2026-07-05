import type { Prisma } from "@prisma/client";

export const activeMistakeReviewWhere: Prisma.MistakeWhereInput = {
  OR: [
    {
      needsManualReview: false,
      reviewStatus: { not: "not_wrong" }
    },
    {
      reviewStatus: "confirmed_wrong"
    }
  ],
  NOT: [
    { questionType: { contains: "OCR" } },
    { questionType: { contains: "复核" } },
    { correctAnswer: { contains: "人工复核" } },
    { correctAnswer: { contains: "重新推导" } },
    { mistakeReason: { contains: "复核" } },
    {
      mistakeArchetypes: {
        some: {
          archetype: {
            OR: [
              { title: { contains: "OCR" } },
              { title: { contains: "复核" } },
              { pattern: { contains: "复核" } },
              { solutionTemplate: { contains: "复核" } }
            ]
          }
        }
      }
    }
  ]
};

export function activeMistakeWhere(where: Prisma.MistakeWhereInput): Prisma.MistakeWhereInput {
  return {
    ...where,
    ...activeMistakeReviewWhere
  };
}
