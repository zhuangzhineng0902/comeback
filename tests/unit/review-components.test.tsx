import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

import { IllustrationRenderer } from "@/components/IllustrationRenderer";
import { KnowledgeTreeView } from "@/components/KnowledgeTreeView";
import { MistakeList } from "@/components/MistakeList";
import { RichExplanationCard } from "@/components/RichExplanationCard";
import { SeverityBadge } from "@/components/SeverityBadge";

describe("review components", () => {
  it("renders teacher-board explanation, knowledge context, and Shenzhen example", () => {
    render(
      <RichExplanationCard
        explanation={{
          diagnosis: "错在没有看最近的 a book。",
          analogy: "There be 就像排队点名。",
          walkthrough: [
            { title: "找最近名词", body: "最近的是 a book。" },
            { title: "判断单复数", body: "a book 是单数。" }
          ],
          wrongAnswerInsight: "are 看起来像对，是因为 two pens 是复数。",
          treeContext: {
            path: ["英语", "七年级", "语法", "There be 句型", "就近原则"],
            prerequisites: ["名词单复数"],
            current: ["There be 句型就近原则"],
            next: ["主谓一致"],
            confusions: ["只看最后一个名词"]
          },
          illustration: {
            type: "flow",
            title: "be 动词看最近名词",
            nodes: [{ label: "a book", tone: "focus" }]
          },
          shenzhenExample: {
            label: "深圳题型风格",
            question: "There ____ two books and a ruler on the desk.",
            answer: "are",
            explanation: "最近的是 two books。"
          }
        }}
      />
    );

    expect(screen.getByText("老师板书式讲解")).toBeTruthy();
    expect(screen.getByText("错在没有看最近的 a book。")).toBeTruthy();
    expect(screen.getByText("知识树位置")).toBeTruthy();
    expect(screen.getByText("英语 → 七年级 → 语法 → There be 句型 → 就近原则")).toBeTruthy();
    expect(screen.getByText("深圳题型风格")).toBeTruthy();
    expect(screen.getByText("There ____ two books and a ruler on the desk.")).toBeTruthy();
  });

  it("renders flow illustrations from structured data", () => {
    render(
      <IllustrationRenderer
        illustration={{
          type: "flow",
          title: "be 动词看最近名词",
          nodes: [
            { label: "There" },
            { label: "is", detail: "由最近名词决定", tone: "focus" },
            { label: "a book", detail: "最近且单数", tone: "warning" }
          ]
        }}
      />
    );

    expect(screen.getByText("be 动词看最近名词")).toBeTruthy();
    expect(screen.getByText("There")).toBeTruthy();
    expect(screen.getByText("由最近名词决定")).toBeTruthy();
  });

  it("renders nothing when illustration data is missing", () => {
    const { container } = render(<IllustrationRenderer illustration={undefined} />);

    expect(container.textContent).toBe("");
  });

  it("does not warn when compare illustrations repeat generated node text", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      render(
        <IllustrationRenderer
          illustration={{
            type: "compare",
            title: "same generated text",
            nodes: [
              { label: "x + y", detail: "same detail" },
              { label: "x + y", detail: "same detail" }
            ]
          }}
        />
      );

      expect(consoleError).not.toHaveBeenCalledWith(expect.stringContaining("Encountered two children with the same key"), expect.anything());
    } finally {
      consoleError.mockRestore();
    }
  });

  it("adds wrapping safeguards to generated illustration text", () => {
    const { container } = render(
      <IllustrationRenderer
        illustration={{
          type: "flow",
          title: "long generated formula",
          nodes: [
            {
              label: "averyveryveryveryverylongenglishtokenthatshouldwrap",
              detail: "x=y+y+y+y+y+y+y+y+y+y+y+y+y+y+y+y+y+y+y+y+y+y"
            }
          ]
        }}
      />
    );

    const node = container.querySelector("[data-illustration-node]");
    const label = screen.getByText("averyveryveryveryverylongenglishtokenthatshouldwrap");
    const detail = screen.getByText("x=y+y+y+y+y+y+y+y+y+y+y+y+y+y+y+y+y+y+y+y+y+y");

    expect(node).toBeTruthy();
    expect(node?.className ?? "").toContain("min-w-0");
    expect(node?.className ?? "").toContain("break-words");
    expect(label.className).toContain("break-words");
    expect(detail.className).toContain("break-words");
  });

  it("labels repeated archetype severity as a high-frequency gap", () => {
    render(<SeverityBadge severity="repeated_archetype" />);

    expect(screen.getByText("高频母题漏洞")).toBeTruthy();
  });

  it("renders mistake links and an empty state", () => {
    const { rerender } = render(<MistakeList mistakes={[]} />);

    expect(screen.getByText("还没有错题。先去 AI 老师页面上传一张照片吧。")).toBeTruthy();

    rerender(
      <MistakeList
        mistakes={[
          {
            id: "mistake-1",
            subject: "数学",
            grade: "八年级",
            questionType: "一次函数图像判断题",
            mistakeReason: "只看截距，没有看斜率。",
            masteryStatus: "new",
            createdAt: new Date("2026-06-26T08:05:00+08:00")
          }
        ]}
      />
    );

    expect(screen.getByText("一次函数图像判断题")).toBeTruthy();
    expect(
      screen
        .getByRole("link", {
          name: "八年级 数学 2026/6/26 08:05 新错题 一次函数图像判断题 只看截距，没有看斜率。"
        })
        .getAttribute("href")
    ).toBe("/mistakes/mistake-1");
  });

  it("renders nested tree nodes with severity summaries", () => {
    render(
      <KnowledgeTreeView
        tree={[
          {
            id: "root",
            name: "函数",
            chapter: "函数",
            severity: "repeated_archetype",
            errorCount: 3,
            repeatedArchetypeCount: 2,
            children: [
              {
                id: "child",
                name: "一次函数图像与性质",
                chapter: "一次函数",
                severity: "weak",
                errorCount: 1,
                repeatedArchetypeCount: 0,
                children: []
              }
            ]
          }
        ]}
      />
    );

    expect(screen.getByText("函数")).toBeTruthy();
    expect(screen.getByText("一次函数图像与性质")).toBeTruthy();
    expect(screen.getByText("函数 · 错误 3 次 · 高频母题 2 次")).toBeTruthy();
    expect(screen.getByRole("link", { name: "函数" }).getAttribute("href")).toBe("/knowledge-points/root");
    expect(screen.getByRole("link", { name: "一次函数图像与性质" }).getAttribute("href")).toBe("/knowledge-points/child");
  });
});
