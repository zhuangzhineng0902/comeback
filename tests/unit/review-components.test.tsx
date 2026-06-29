import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";

import { IllustrationRenderer } from "@/components/IllustrationRenderer";
import { KnowledgeTreeView } from "@/components/KnowledgeTreeView";
import { MistakeList } from "@/components/MistakeList";
import { SeverityBadge } from "@/components/SeverityBadge";

describe("review components", () => {
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
            createdAt: new Date("2026-06-26T00:00:00Z")
          }
        ]}
      />
    );

    expect(screen.getByText("一次函数图像判断题")).toBeTruthy();
    expect(
      screen
        .getByRole("link", {
          name: "八年级 数学 2026/6/26 新错题 一次函数图像判断题 只看截距，没有看斜率。"
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
  });
});
