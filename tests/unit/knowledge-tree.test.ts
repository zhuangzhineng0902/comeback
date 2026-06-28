import { describe, expect, it } from "vitest";
import { buildKnowledgeTree } from "@/lib/knowledge/tree";
import type { TreeGap, TreePoint } from "@/lib/knowledge/tree";

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

  it("sorts roots and children by sort order even when points are unsorted", () => {
    const tree = buildKnowledgeTree({
      points: [
        { id: "child-b", name: "Child B", parentId: "root", chapter: "Chapter", sortOrder: 30 },
        { id: "root-b", name: "Root B", parentId: null, chapter: "Chapter", sortOrder: 20 },
        { id: "child-a", name: "Child A", parentId: "root", chapter: "Chapter", sortOrder: 10 },
        { id: "root", name: "Root A", parentId: null, chapter: "Chapter", sortOrder: 1 }
      ],
      gaps: []
    });

    expect(tree.map((node) => node.id)).toEqual(["root", "root-b"]);
    expect(tree[0].children.map((node) => node.id)).toEqual(["child-a", "child-b"]);
  });

  it("bubbles child and grandchild severity to parent", () => {
    const tree = buildKnowledgeTree({
      points: [
        { id: "root", name: "Root", parentId: null, chapter: "Chapter", sortOrder: 1 },
        { id: "child", name: "Child", parentId: "root", chapter: "Chapter", sortOrder: 2 },
        { id: "grandchild", name: "Grandchild", parentId: "child", chapter: "Chapter", sortOrder: 3 }
      ],
      gaps: [
        { knowledgePointId: "root", severity: "weak", errorCount: 2, repeatedArchetypeCount: 0 },
        { knowledgePointId: "grandchild", severity: "important", errorCount: 3, repeatedArchetypeCount: 0 }
      ]
    });

    expect(tree[0].severity).toBe("important");
    expect(tree[0].children[0].severity).toBe("important");
    expect(tree[0].children[0].children[0].severity).toBe("important");
  });

  it("aggregates error and repeated archetype counts from all descendants", () => {
    const tree = buildKnowledgeTree({
      points: [
        { id: "root", name: "Root", parentId: null, chapter: "Chapter", sortOrder: 1 },
        { id: "child-a", name: "Child A", parentId: "root", chapter: "Chapter", sortOrder: 2 },
        { id: "child-b", name: "Child B", parentId: "root", chapter: "Chapter", sortOrder: 3 },
        { id: "grandchild", name: "Grandchild", parentId: "child-a", chapter: "Chapter", sortOrder: 4 }
      ],
      gaps: [
        { knowledgePointId: "root", severity: "weak", errorCount: 1, repeatedArchetypeCount: 0 },
        { knowledgePointId: "child-a", severity: "important", errorCount: 2, repeatedArchetypeCount: 1 },
        { knowledgePointId: "child-b", severity: "normal", errorCount: 3, repeatedArchetypeCount: 0 },
        { knowledgePointId: "grandchild", severity: "repeated_archetype", errorCount: 4, repeatedArchetypeCount: 2 }
      ]
    });

    expect(tree[0].errorCount).toBe(10);
    expect(tree[0].repeatedArchetypeCount).toBe(3);
    expect(tree[0].children[0].errorCount).toBe(6);
    expect(tree[0].children[0].repeatedArchetypeCount).toBe(3);
  });

  it("treats a point with a missing parent as a root", () => {
    const tree = buildKnowledgeTree({
      points: [
        { id: "orphan", name: "Orphan", parentId: "missing", chapter: "Chapter", sortOrder: 1 },
        { id: "root", name: "Root", parentId: null, chapter: "Chapter", sortOrder: 2 }
      ],
      gaps: []
    });

    expect(tree.map((node) => node.id)).toEqual(["orphan", "root"]);
    expect(tree[0].children).toEqual([]);
  });

  it("defaults nodes without gaps to normal severity and zero counts", () => {
    const tree = buildKnowledgeTree({
      points: [{ id: "root", name: "Root", parentId: null, chapter: "Chapter", sortOrder: 1 }],
      gaps: []
    });

    expect(tree[0]).toMatchObject({
      severity: "normal",
      errorCount: 0,
      repeatedArchetypeCount: 0
    });
  });

  it("normalizes unknown severity strings to normal", () => {
    const tree = buildKnowledgeTree({
      points: [{ id: "root", name: "Root", parentId: null, chapter: "Chapter", sortOrder: 1 }],
      gaps: [{ knowledgePointId: "root", severity: "unexpected", errorCount: 1, repeatedArchetypeCount: 1 }]
    });

    expect(tree[0].severity).toBe("normal");
    expect(tree[0].errorCount).toBe(1);
    expect(tree[0].repeatedArchetypeCount).toBe(1);
  });

  it("does not reorder or mutate input arrays", () => {
    const points: TreePoint[] = [
      { id: "child", name: "Child", parentId: "root", chapter: "Chapter", sortOrder: 2 },
      { id: "root", name: "Root", parentId: null, chapter: "Chapter", sortOrder: 1 }
    ];
    const gaps: TreeGap[] = [
      { knowledgePointId: "child", severity: "weak", errorCount: 2, repeatedArchetypeCount: 0 },
      { knowledgePointId: "root", severity: "normal", errorCount: 0, repeatedArchetypeCount: 0 }
    ];
    const pointOrder = points.map((point) => point.id);
    const gapOrder = gaps.map((gap) => gap.knowledgePointId);
    const pointSnapshots = points.map((point) => ({ ...point }));
    const gapSnapshots = gaps.map((gap) => ({ ...gap }));

    buildKnowledgeTree({ points, gaps });

    expect(points.map((point) => point.id)).toEqual(pointOrder);
    expect(gaps.map((gap) => gap.knowledgePointId)).toEqual(gapOrder);
    expect(points).toEqual(pointSnapshots);
    expect(gaps).toEqual(gapSnapshots);
  });
});
