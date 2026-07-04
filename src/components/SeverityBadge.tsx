import React from "react";

const labels: Record<string, string> = {
  normal: "普通节点",
  weak: "普通薄弱",
  important: "重点薄弱",
  repeated_archetype: "高频母题漏洞"
};

const classes: Record<string, string> = {
  normal: "border-slate-200 bg-slate-100 text-slate-700",
  weak: "border-amber-200 bg-amber-50 text-amber-800",
  important: "border-rose-200 bg-rose-50 text-rose-700",
  repeated_archetype: "border-red-500 bg-red-600 text-white"
};

export function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span className={`rounded-md border px-2 py-1 text-xs font-medium ${classes[severity] ?? classes.normal}`}>
      {labels[severity] ?? labels.normal}
    </span>
  );
}
