import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PhotoUploadTutor } from "@/components/PhotoUploadTutor";

describe("PhotoUploadTutor", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the upload and chat affordances", () => {
    render(<PhotoUploadTutor />);

    expect(screen.getByText("上传错题照片")).toBeTruthy();
    expect(screen.getByText("自动识别学科")).toBeTruthy();
    expect(screen.getByText("自动识别年级")).toBeTruthy();
    expect(
      screen.getByPlaceholderText("继续问老师：为什么这里要这样做？")
    ).toBeTruthy();
  });

  it("allows selecting multiple photos", () => {
    const { container } = render(<PhotoUploadTutor />);
    const input = container.querySelector("input[type='file']");

    expect(input?.hasAttribute("multiple")).toBe(true);
  });

  it("shows immediate feedback while analyzing an uploaded photo", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)));
    const { container } = render(<PhotoUploadTutor />);
    const input = container.querySelector("input[type='file']");

    fireEvent.change(input!, {
      target: {
        files: [
          new File(["image-1"], "第1页.png", { type: "image/png" }),
          new File(["image-2"], "第2页.png", { type: "image/png" })
        ]
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "开始分析" }));

    expect(screen.getByText("已选择 2 张图片")).toBeTruthy();
    expect(screen.getByText("AI 正在识别照片并整理错因，通常需要 15-30 秒。")).toBeTruthy();
    expect(screen.getByRole("button", { name: "分析中" }).hasAttribute("disabled")).toBe(true);
  });

  it("rejects selecting more than sixteen photos before upload", () => {
    const { container } = render(<PhotoUploadTutor />);
    const input = container.querySelector("input[type='file']");
    const files = Array.from({ length: 17 }, (_, index) => new File(["image"], `第${index + 1}页.png`, { type: "image/png" }));

    fireEvent.change(input!, { target: { files } });

    expect(screen.getByText("一次最多上传 16 张图片。")).toBeTruthy();
  });

  it("renders every analyzed mistake returned by the upload API", async () => {
    const baseAnalysis = {
      subject: "英语",
      grade: "七年级",
      questionType: "第一道选择题",
      recognizedText: "There ____ a book on the desk.",
      studentAnswer: "are",
      correctAnswer: "is",
      knowledgePoints: [{ name: "There be 句型", confidence: 0.9 }],
      mistakeReason: "没有看最近名词。",
      studentFriendlyExplanation: "看 be 后最近的名词。",
      example: "There is a book.",
      archetype: {
        title: "There be 母题",
        pattern: "判断 be 动词",
        solutionTemplate: "先找最近名词。",
        commonTraps: ["只看复数名词"]
      },
      practiceQuestions: [{ question: "There ____ two books.", answer: "are", hint: "看最近名词。" }],
      gradingEvidence: {
        markType: "partial",
        markText: "半勾，扣 1 分",
        deductedScore: 1,
        teacherMarkConfidence: 0.82,
        answerMatchConfidence: 0.76,
        judgement: "partial",
        isPartialCredit: true,
        needsConfirmation: true,
        evidenceSummary: "老师批改处有半勾，学生答案只完成前半步。",
        studentAnswerLocation: "题目下方空白处"
      }
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            mode: "api",
            analysis: baseAnalysis,
            analyses: [
              baseAnalysis,
              { ...baseAnalysis, questionType: "第二道填空题", recognizedText: "There ____ two pens." }
            ],
            uploadedImages: [{ index: 0, filename: "试卷.png", url: "/api/uploads/test-paper.png" }],
            imageGroups: [
              {
                image: { index: 0, filename: "试卷.png", url: "/api/uploads/test-paper.png" },
                analyses: [
                  baseAnalysis,
                  { ...baseAnalysis, questionType: "第二道填空题", recognizedText: "There ____ two pens." }
                ],
                savedMistakes: [
                  { mistakeId: "mistake-1", gapSeverity: "normal" },
                  { mistakeId: "mistake-2", gapSeverity: "important" }
                ]
              }
            ],
            mistakeId: "mistake-1",
            gapSeverity: "normal",
            savedMistakes: [
              { mistakeId: "mistake-1", gapSeverity: "normal" },
              { mistakeId: "mistake-2", gapSeverity: "important" }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );
    const { container } = render(<PhotoUploadTutor />);
    const input = container.querySelector("input[type='file']");

    fireEvent.change(input!, {
      target: {
        files: [new File(["image"], "试卷.png", { type: "image/png" })]
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "开始分析" }));

    await waitFor(() => {
      expect(screen.getByText("第 1 道错题")).toBeTruthy();
      expect(screen.getByText("第 2 道错题")).toBeTruthy();
    });
    expect(screen.getByText("第一道选择题")).toBeTruthy();
    expect(screen.getByText("第二道填空题")).toBeTruthy();
    expect(screen.getAllByText("判定依据").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("半对/部分得分").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("需人工确认").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("老师批改处有半勾，学生答案只完成前半步。").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("img", { name: "试卷.png 原图预览" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "查看 试卷.png 原图" }));
    expect(screen.getByRole("dialog", { name: "试卷.png 原图" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "试卷.png 原图" })).toBeTruthy();
    expect(screen.getByText("我已经登记 2 道错题。先从第 1 题「There be 句型」开始复习。")).toBeTruthy();
  });

  it("loads analysis and chat history and restores a selected record", async () => {
    const historyAnalysis = {
      subject: "数学",
      grade: "七年级",
      questionType: "一元一次方程",
      recognizedText: "2x + 3 = 7",
      studentAnswer: "x=3",
      correctAnswer: "x=2",
      knowledgePoints: [{ name: "一元一次方程", confidence: 0.9 }],
      mistakeReason: "移项规则不熟。",
      studentFriendlyExplanation: "先两边同时减 3，再除以 2。",
      example: "3x+1=7",
      archetype: {
        title: "一元一次方程母题",
        pattern: "ax+b=c",
        solutionTemplate: "移项，合并，系数化 1",
        commonTraps: ["移项忘记变号"]
      },
      practiceQuestions: [{ question: "x+1=3", answer: "x=2", hint: "两边减 1。" }]
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/history") {
          return new Response(
            JSON.stringify({
              history: [
                {
                  mistakeId: "mistake-history-1",
                  mode: "api",
                  analysis: historyAnalysis,
                  analyses: [historyAnalysis],
                  gapSeverity: "normal",
                  savedMistakes: [{ mistakeId: "mistake-history-1", gapSeverity: "normal" }],
                  uploadedImages: [{ index: 0, filename: "历史试卷.png", url: "/api/uploads/history-paper.png" }],
                  imageGroups: [
                    {
                      image: { index: 0, filename: "历史试卷.png", url: "/api/uploads/history-paper.png" },
                      analyses: [historyAnalysis],
                      savedMistakes: [{ mistakeId: "mistake-history-1", gapSeverity: "normal" }]
                    }
                  ],
                  messages: [
                    { role: "assistant", content: "先两边同时减 3，再除以 2。" },
                    { role: "user", content: "为什么要同时减 3？" },
                    { role: "assistant", content: "因为等式两边要保持平衡。" }
                  ],
                  createdAt: "2026-07-01T08:00:00.000Z"
                }
              ]
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        return new Response(JSON.stringify({ error: "unexpected request" }), { status: 500 });
      })
    );

    render(<PhotoUploadTutor />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "查看历史 一元一次方程" })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "查看历史 一元一次方程" }));

    expect(screen.getAllByText("一元一次方程").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("为什么要同时减 3？")).toBeTruthy();
    expect(screen.getByText("因为等式两边要保持平衡。")).toBeTruthy();
    expect(screen.getByRole("img", { name: "历史试卷.png 原图预览" })).toBeTruthy();
  });
});
