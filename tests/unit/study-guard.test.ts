import { describe, expect, it } from "vitest";
import { classifyStudyIntent, createStudyRefusal } from "@/lib/study-guard";

describe("study guardrails", () => {
  it("allows junior-high study requests", () => {
    expect(classifyStudyIntent("帮我讲一下这道一次函数错题")).toEqual({
      allowed: true,
      category: "study"
    });
  });

  it("blocks game requests", () => {
    expect(classifyStudyIntent("帮我查一下这个游戏怎么通关")).toEqual({
      allowed: false,
      category: "game"
    });
  });

  it("blocks entertainment video requests", () => {
    expect(classifyStudyIntent("推荐几个好看的短视频")).toEqual({
      allowed: false,
      category: "entertainment"
    });
  });

  it("returns a warm learning redirection", () => {
    expect(createStudyRefusal("game")).toContain("我主要帮你学习");
    expect(createStudyRefusal("game")).toContain("类似题");
  });
});
