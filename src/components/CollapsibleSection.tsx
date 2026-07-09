"use client";

import { useState, type ReactNode } from "react";

type CollapsibleSectionProps = {
  title: string;
  icon?: string;
  defaultOpen?: boolean;
  children: ReactNode;
};

// 折りたたみ可能なセクション。サイドパネルをグループにまとめて見通しを良くする。
export default function CollapsibleSection({
  title,
  icon,
  defaultOpen = false,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="w-full overflow-hidden rounded-lg border border-stone-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-stone-50"
      >
        <span className="flex items-center gap-2 font-semibold text-stone-800">
          {icon && <span aria-hidden>{icon}</span>}
          {title}
        </span>
        <span
          className={`text-stone-400 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          ▾
        </span>
      </button>
      {open && <div className="flex flex-col gap-4 border-t border-stone-100 p-4">{children}</div>}
    </div>
  );
}
