import { getGapSeverityRank } from "@/lib/knowledge/severity";
import type { GapSeverity } from "@/lib/types";

export type TreePoint = {
  id: string;
  name: string;
  parentId: string | null;
  chapter: string;
  sortOrder: number;
};

export type TreeGap = {
  knowledgePointId: string;
  severity: GapSeverity | string;
  errorCount: number;
  repeatedArchetypeCount: number;
};

export type KnowledgeTreeNode = {
  id: string;
  name: string;
  chapter: string;
  severity: GapSeverity;
  errorCount: number;
  repeatedArchetypeCount: number;
  children: KnowledgeTreeNode[];
};

function normalizeSeverity(value: string | undefined): GapSeverity {
  if (value === "weak" || value === "important" || value === "repeated_archetype") {
    return value;
  }
  return "normal";
}

function strongerSeverity(a: GapSeverity, b: GapSeverity): GapSeverity {
  return getGapSeverityRank(a) >= getGapSeverityRank(b) ? a : b;
}

export function buildKnowledgeTree(input: { points: TreePoint[]; gaps: TreeGap[] }): KnowledgeTreeNode[] {
  const gapByPoint = new Map(input.gaps.map((gap) => [gap.knowledgePointId, gap]));
  const nodes = new Map<string, KnowledgeTreeNode>();

  for (const point of input.points) {
    const gap = gapByPoint.get(point.id);
    nodes.set(point.id, {
      id: point.id,
      name: point.name,
      chapter: point.chapter,
      severity: normalizeSeverity(gap?.severity),
      errorCount: gap?.errorCount ?? 0,
      repeatedArchetypeCount: gap?.repeatedArchetypeCount ?? 0,
      children: []
    });
  }

  const roots: KnowledgeTreeNode[] = [];

  for (const point of [...input.points].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const node = nodes.get(point.id);
    if (!node) {
      continue;
    }

    if (point.parentId && nodes.has(point.parentId)) {
      nodes.get(point.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  function bubbleSeverity(node: KnowledgeTreeNode): GapSeverity {
    for (const child of node.children) {
      node.severity = strongerSeverity(node.severity, bubbleSeverity(child));
      node.errorCount += child.errorCount;
      node.repeatedArchetypeCount += child.repeatedArchetypeCount;
    }
    return node.severity;
  }

  roots.forEach(bubbleSeverity);
  return roots;
}
