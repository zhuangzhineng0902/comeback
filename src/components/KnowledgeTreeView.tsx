import Link from "next/link";
import React from "react";

import { SeverityBadge } from "@/components/SeverityBadge";

export type TreeNode = {
  id: string;
  name: string;
  chapter: string;
  severity: string;
  errorCount: number;
  repeatedArchetypeCount: number;
  children: TreeNode[];
};

function NodeView({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  return (
    <li className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3" style={{ paddingLeft: depth * 14 }}>
        <div>
          <Link href={`/knowledge-points/${node.id}`} className="font-medium text-ink hover:text-sky-700">
            {node.name}
          </Link>
          <p className="mt-1 text-xs text-slate-500">
            {node.chapter} · 错误 {node.errorCount} 次 · 高频母题 {node.repeatedArchetypeCount} 次
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={node.severity} />
          <Link
            href={`/knowledge-points/${node.id}`}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-sky-300 hover:text-sky-700"
            aria-label={`查看${node.name}解析详情`}
          >
            查看解析
          </Link>
        </div>
      </div>
      {node.children.length > 0 ? (
        <ul className="mt-3 grid gap-2">
          {node.children.map((child) => (
            <NodeView key={child.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function KnowledgeTreeView({ tree }: { tree: TreeNode[] }) {
  if (tree.length === 0) {
    return (
      <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
        这个年级和学科还没有知识点数据。
      </p>
    );
  }

  return (
    <ul className="grid gap-3">
      {tree.map((node) => (
        <NodeView key={node.id} node={node} />
      ))}
    </ul>
  );
}
