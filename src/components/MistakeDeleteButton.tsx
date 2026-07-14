"use client";

import { Trash2 } from "lucide-react";
import React, { useState } from "react";

type MistakeDeleteButtonProps = {
  mistakeId: string;
  redirectTo?: string;
  size?: "sm" | "md";
};

async function readJson(response: Response) {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function MistakeDeleteButton({ mistakeId, redirectTo, size = "md" }: MistakeDeleteButtonProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");

  async function deleteMistake() {
    if (!window.confirm("确定删除这道错题吗？对应知识漏洞和期末知识树会同步刷新。")) {
      return;
    }

    setIsDeleting(true);
    setError("");
    try {
      const response = await fetch(`/api/mistakes/${encodeURIComponent(mistakeId)}`, {
        method: "DELETE"
      });
      const data = await readJson(response);
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "删除失败，请稍后再试。");
      }

      if (redirectTo) {
        window.location.assign(redirectTo);
      } else {
        window.location.reload();
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除失败，请稍后再试。");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void deleteMistake();
        }}
        disabled={isDeleting}
        className={`inline-flex items-center gap-2 rounded-md border border-red-200 bg-white font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 ${
          size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-2 text-sm"
        }`}
      >
        <Trash2 className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} aria-hidden="true" />
        {isDeleting ? "删除中" : "删除"}
      </button>
      {error ? <span className="max-w-48 text-right text-xs text-red-700">{error}</span> : null}
    </div>
  );
}
