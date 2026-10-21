"use client";

import { useEffect, useRef } from "react";

/** Bottom sheet built on <dialog>: focus trap, Esc to close, backdrop tap to close. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-label={title}
      className="m-0 mt-auto w-full max-w-none bg-transparent p-0 text-ink backdrop:bg-black/55 sm:mx-auto sm:max-w-lg"
    >
      {open && (
        <div className="sheet-enter pb-safe mx-auto max-w-lg rounded-t-3xl border-t border-rule bg-raised px-5 pt-3">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[var(--rule-strong)]" aria-hidden />
          <div className="mb-4 flex items-start justify-between gap-3">
            <h2 className="font-display text-2xl">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="-mr-2 -mt-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-ink-soft"
              aria-label="Close"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M5 5l10 10M15 5L5 15" />
              </svg>
            </button>
          </div>
          <div className="max-h-[70dvh] overflow-y-auto pb-4">{children}</div>
        </div>
      )}
    </dialog>
  );
}
