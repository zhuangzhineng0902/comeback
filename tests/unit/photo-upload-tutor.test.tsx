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
      practiceQuestions: [{ question: "There ____ two books.", answer: "are", hint: "看最近名词。" }]
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
    expect(screen.getByRole("img", { name: "试卷.png 原图预览" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "查看 试卷.png 原图" }));
    expect(screen.getByRole("dialog", { name: "试卷.png 原图" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "试卷.png 原图" })).toBeTruthy();
    expect(screen.getByText("我已经登记 2 道错题。先从第 1 题「There be 句型」开始复习。")).toBeTruthy();
  });
});
