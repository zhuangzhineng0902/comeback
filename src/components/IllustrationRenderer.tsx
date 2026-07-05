import React from "react";

import type { RichIllustration, RichIllustrationTone } from "@/lib/types";

type IllustrationRendererProps = {
  illustration?: RichIllustration;
};

const toneClassName: Record<RichIllustrationTone, string> = {
  normal: "border-slate-200 bg-white text-slate-700",
  focus: "border-sky-300 bg-sky-50 text-sky-950",
  warning: "border-amber-300 bg-amber-50 text-amber-950"
};

const labelClassName = "min-w-0 break-words text-sm font-semibold";
const detailClassName = "min-w-0 break-words text-xs leading-5";

function nodeClassName(tone: RichIllustrationTone | undefined) {
  return toneClassName[tone ?? "normal"];
}

export function IllustrationRenderer({ illustration }: IllustrationRendererProps) {
  if (!illustration) {
    return null;
  }

  if (illustration.type === "compare") {
    return (
      <figure className="rounded-md border border-slate-200 bg-slate-50 p-4">
        <figcaption className="text-xs font-medium text-slate-500">{illustration.title}</figcaption>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {illustration.nodes.map((node, index) => (
            <div
              key={`${node.label}-${node.detail ?? ""}-${index}`}
              className={`min-w-0 break-words rounded-md border p-3 ${nodeClassName(node.tone)}`}
              data-illustration-node
            >
              <p className={labelClassName}>{node.label}</p>
              {node.detail ? <p className={`mt-1 ${detailClassName}`}>{node.detail}</p> : null}
            </div>
          ))}
        </div>
      </figure>
    );
  }

  if (illustration.type === "treePath") {
    return (
      <figure className="rounded-md border border-slate-200 bg-slate-50 p-4">
        <figcaption className="text-xs font-medium text-slate-500">{illustration.title}</figcaption>
        <div className="mt-3 space-y-2">
          {illustration.nodes.map((node, index) => (
            <div
              key={`${node.label}-${index}`}
              className={`min-w-0 break-words rounded-md border p-2 sm:ml-[var(--tree-indent)] ${nodeClassName(node.tone)}`}
              data-illustration-node
              style={{ "--tree-indent": `${Math.min(index, 4) * 14}px` } as React.CSSProperties}
            >
              <p className={labelClassName}>{node.label}</p>
              {node.detail ? <p className={detailClassName}>{node.detail}</p> : null}
            </div>
          ))}
        </div>
      </figure>
    );
  }

  return (
    <figure className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <figcaption className="text-xs font-medium text-slate-500">{illustration.title}</figcaption>
      <div className="mt-3 flex flex-wrap items-stretch gap-2">
        {illustration.nodes.map((node, index) => (
          <React.Fragment key={`${node.label}-${index}`}>
            <div
              className={`min-w-0 basis-24 break-words rounded-md border p-3 ${nodeClassName(node.tone)} flex-1`}
              data-illustration-node
            >
              <p className={labelClassName}>{node.label}</p>
              {node.detail ? <p className={`mt-1 ${detailClassName}`}>{node.detail}</p> : null}
            </div>
            {index < illustration.nodes.length - 1 ? (
              <div className="flex items-center text-slate-400" aria-hidden="true">
                →
              </div>
            ) : null}
          </React.Fragment>
        ))}
      </div>
    </figure>
  );
}
