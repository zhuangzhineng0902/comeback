"use client";

import React from "react";
import { useState } from "react";
import { X } from "lucide-react";

type OriginalPhotoViewerProps = {
  filename: string;
  imageUrl: string;
};

export function OriginalPhotoViewer({ filename, imageUrl }: OriginalPhotoViewerProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-ink">原始上传照片</h2>
        <button
          type="button"
          aria-label={`查看 ${filename} 原图`}
          onClick={() => setIsOpen(true)}
          className="mt-3 block w-full overflow-hidden rounded-md border border-slate-200 bg-slate-50 text-left transition hover:border-slate-400"
        >
          <img
            src={imageUrl}
            alt={`${filename} 原图预览`}
            className="h-auto max-h-[360px] w-full object-contain"
          />
        </button>
        <p className="mt-2 text-xs text-slate-500">点击图片查看原图：{filename}</p>
      </section>

      {isOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${filename} 原图`}
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-4"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="max-h-full w-full max-w-5xl overflow-hidden rounded-lg bg-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <p className="truncate text-sm font-medium text-ink">{filename}</p>
              <button
                type="button"
                aria-label="关闭原图"
                onClick={() => setIsOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-md text-slate-600 transition hover:bg-slate-100 hover:text-ink"
              >
                <X aria-hidden="true" size={18} />
              </button>
            </div>
            <div className="max-h-[calc(100vh-120px)] overflow-auto bg-slate-100 p-3">
              <img src={imageUrl} alt={`${filename} 原图`} className="mx-auto h-auto max-w-full rounded-md bg-white" />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
