import { describe, expect, it } from "vitest";

import { classifyCompositePageRole, matchAnswerSheetMistakes } from "@/lib/analysis/jobs";
import type { PaperVisionContext } from "@/lib/types";

function context(rawText: string, questionCount: number, gradingMarkCount = 0): PaperVisionContext {
  return {
    sourceImageIndex: 0,
    engine: "ocr",
    status: "available",
    summary: "sample",
    rawText,
    textBlocks: [],
    questionCandidates: Array.from({ length: questionCount }, (_, index) => ({ questionId: String(index + 1) })),
    gradingMarks: Array.from({ length: gradingMarkCount }, () => ({ markType: "cross" })),
    mistakeCandidates: []
  };
}

describe("composite paper page roles", () => {
  it("recognizes the supplied question pages as question pages", () => {
    expect(classifyCompositePageRole({ filename: "2906.JPG", role: "unknown" }, context("深圳市七年级数学训练试卷 第1页", 16))).toBe("question");
    expect(classifyCompositePageRole({ filename: "2907.JPG", role: "unknown" }, context("17.（9分）如图1", 3))).toBe("question");
  });

  it("recognizes answer cards even when they contain question numbers", () => {
    expect(classifyCompositePageRole({ filename: "2908.JPG", role: "unknown" }, context("数学答题卡 请在各题目的答题区域内作答", 15, 74))).toBe("answer_sheet");
    expect(classifyCompositePageRole({ filename: "2909.JPG", role: "unknown" }, context("请在各题目的答题区域内作答，超出黑色矩形边框限定区域的答案无效", 1, 21))).toBe("answer_sheet");
  });

  it("matches answer-card mistakes to question pages by question number", () => {
    const questionContext = context("17.（9分）如图1", 0);
    questionContext.questionCandidates = [{ questionId: "17", text: "17.（9分）如图1，求甲的速度" }];
    const answerContext = context("17.（9分）", 0, 2);
    answerContext.mistakeCandidates = [{
      questionId: "17",
      markTypes: ["cross"],
      judgement: "wrong",
      evidenceSummary: "第17题有红笔叉号"
    }];
    const loadedPages = [
      { filename: "2907.JPG", imagePath: "uploads/2907.JPG", analysisImagePath: null, analysisMimeType: "image/jpeg", role: "question" as const, imageBase64: "question", paperVisionContext: questionContext },
      { filename: "2908.JPG", imagePath: "uploads/2908.JPG", analysisImagePath: null, analysisMimeType: "image/jpeg", role: "answer_sheet" as const, imageBase64: "answer", paperVisionContext: answerContext }
    ];

    expect(matchAnswerSheetMistakes(loadedPages)).toMatchObject({
      unmatched: 0,
      matched: [{ questionId: "17", questionImageIndex: 0, answerSheetImageIndex: 1 }]
    });
  });

  it("infers an OCR-missed question from the adjacent range on the same question page", () => {
    const questionContext = context("17、18、19、20题", 0);
    questionContext.questionCandidates = ["17", "18", "19"].map((questionId) => ({ questionId, text: `${questionId}. 题干` }));
    const answerContext = context("20.（10分）", 0, 2);
    answerContext.mistakeCandidates = [{
      questionId: "20",
      markTypes: ["deduction"],
      judgement: "partial",
      evidenceSummary: "第20题有扣分"
    }];
    const result = matchAnswerSheetMistakes([
      { filename: "questions.JPG", imagePath: "uploads/questions.JPG", analysisImagePath: null, analysisMimeType: "image/jpeg", role: "question", imageBase64: "question", paperVisionContext: questionContext },
      { filename: "answers.JPG", imagePath: "uploads/answers.JPG", analysisImagePath: null, analysisMimeType: "image/jpeg", role: "answer_sheet", imageBase64: "answer", paperVisionContext: answerContext }
    ]);

    expect(result.matched[0]).toMatchObject({ questionId: "20", questionImageIndex: 0, answerSheetImageIndex: 1 });
    expect(result.matched[0].questionText).toContain("OCR 未完整识别第 20 题");
  });
});
