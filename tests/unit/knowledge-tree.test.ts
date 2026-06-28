import { describe, expect, it } from "vitest";
import { buildKnowledgeTree } from "@/lib/knowledge/tree";

describe("knowledge tree", () => {
  it("builds one tree for a single grade and subject", () => {
    const tree = buildKnowledgeTree({
      points: [
        { id: "root", name: "一次函数", parentId: null, chapter: "一次函数", sortOrder: 1 },
        { id: "child", name: "一次函数图像与性质", parentId: "root", chapter: "一次函数", sortOrder: 2 }
      ],
      gaps: [{ knowledgePointId: "child", severity: "repeated_archetype", errorCount: 2, repeatedArchetypeCount: 2 }]
    });

    expect(tree).toHaveLength(1);
    expect(tree[0].children[0].severity).toBe("repeated_archetype");
  });
});
