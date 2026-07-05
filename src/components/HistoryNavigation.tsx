"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import React, { useEffect, useRef } from "react";

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return target.isContentEditable || tagName === "input" || tagName === "textarea" || tagName === "select";
}

export function HistoryNavigation() {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    function onTouchStart(event: TouchEvent) {
      if (event.touches.length !== 1 || isEditableTarget(event.target)) {
        touchStartRef.current = null;
        return;
      }

      const touch = event.touches[0];
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    }

    function onTouchEnd(event: TouchEvent) {
      const start = touchStartRef.current;
      touchStartRef.current = null;
      if (!start || event.changedTouches.length !== 1 || isEditableTarget(event.target)) {
        return;
      }

      const touch = event.changedTouches[0];
      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;
      const isHorizontalSwipe = Math.abs(deltaX) > 70 && Math.abs(deltaY) < 50;
      if (!isHorizontalSwipe) {
        return;
      }

      if (deltaX > 0) {
        window.history.back();
      } else {
        window.history.forward();
      }
    }

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        aria-label="返回上一页"
        title="返回上一页"
        onClick={() => window.history.back()}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 active:bg-slate-100"
      >
        <ChevronLeft className="h-5 w-5" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="前进到下一页"
        title="前进到下一页"
        onClick={() => window.history.forward()}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 active:bg-slate-100"
      >
        <ChevronRight className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  );
}
