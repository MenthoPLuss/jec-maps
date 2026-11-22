"use client";

import { useEffect, useRef } from "react";

import InfoBar from "./InfoBar";

export type SheetSize = "peek" | "half" | "full";

const HEIGHTS: Record<SheetSize, string> = {
  peek: "max-h-[34dvh]",
  half: "max-h-[55dvh]",
  full: "max-h-[85dvh]",
};
const NEXT: Record<SheetSize, SheetSize> = { peek: "half", half: "full", full: "peek" };
const LABELS: Record<SheetSize, string> = { peek: "Show more", half: "Show everything", full: "Show less" };

interface BottomSheetProps {
  size: SheetSize;
  onResize: (size: SheetSize) => void;
  /** False when there is nothing to expand. */
  resizable: boolean;
  /** Told how tall the sheet is, so that nothing hides behind it. */
  onHeight: (px: number) => void;
  children: React.ReactNode;
}

/** The panel at the bottom. The disclaimer is always part of it. */
export default function BottomSheet({ size, onResize, resizable, onHeight, children }: BottomSheetProps) {
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = sheet.current;
    if (!element) return;
    const observer = new ResizeObserver(() => onHeight(element.offsetHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, [onHeight]);

  return (
    <div
      ref={sheet}
      data-testid="sheet"
      data-size={size}
      className={`pointer-events-auto flex w-full max-w-xl flex-col rounded-t-2xl bg-surface text-ink shadow-[0_-4px_20px_rgb(0_0_0/20%)] ${HEIGHTS[size]}`}
    >
      {resizable && (
        <button
          type="button"
          aria-label={LABELS[size]}
          aria-expanded={size !== "peek"}
          onClick={() => onResize(NEXT[size])}
          className="flex min-h-8 w-full shrink-0 items-center justify-center rounded-t-2xl"
        >
          <span aria-hidden className="h-1.5 w-12 rounded-full bg-line" />
        </button>
      )}
      <div className="min-h-0 overflow-y-auto overscroll-contain">{children}</div>
      <div className="shrink-0 border-t border-line pb-[var(--safe-bottom)]">
        <InfoBar />
      </div>
    </div>
  );
}
