"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useState } from "react";
import { AddSheet, type AddPreset } from "@/components/AddSheet";
import { useMali } from "@/lib/data";

const TABS = [
  { href: "/home", label: "Home", icon: HomeIcon },
  { href: "/envelopes", label: "Envelopes", icon: EnvelopeIcon },
  { href: "/accounts", label: "Accounts", icon: WalletIcon },
  { href: "/goals", label: "Goals", icon: FlagIcon },
];

const AddCtx = createContext<(preset?: AddPreset) => void>(() => {});
/** Opens the add sheet from anywhere, optionally pre-filled. */
export const useAdd = () => useContext(AddCtx);

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { toast, error, reload } = useMali();
  const [preset, setPreset] = useState<AddPreset | null>(null);
  const open = useCallback((p?: AddPreset) => setPreset(p ?? { mode: "spend" }), []);

  return (
    <AddCtx.Provider value={open}>
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
        <header className="pt-safe flex items-center justify-between px-4">
          <Link href="/home" className="font-display flex min-h-12 items-center gap-2 text-lg text-ink-soft">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" width={26} height={26} className="rounded-md" />
            Mali Maker
          </Link>
          <nav className="flex items-center gap-1" aria-label="More">
            {[
              { href: "/plan", label: "Plan" },
              { href: "/more", label: "More" },
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`flex min-h-11 items-center rounded-full px-4 text-[15px] font-semibold ${
                  path.startsWith(l.href) ? "bg-raised text-ink" : "text-ink-soft"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </header>

        {error && (
          <div role="alert" className="mx-4 mt-2 rounded-2xl border border-[var(--over)] p-3 text-[15px]">
            {error}{" "}
            <button className="font-bold underline" onClick={() => reload()}>
              Retry
            </button>
          </div>
        )}

        <main className="flex-1 px-4 pb-32">{children}</main>

        {toast && (
          <div
            role="status"
            className="toast fixed inset-x-4 bottom-28 z-40 mx-auto max-w-md rounded-2xl bg-ink px-4 py-3 text-center text-[15px] font-semibold text-bg shadow-lg"
          >
            {toast}
          </div>
        )}

        <nav
          aria-label="Main"
          className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-[color-mix(in_oklab,var(--bg)_92%,transparent)] backdrop-blur"
        >
          <ul className="mx-auto grid max-w-lg grid-cols-5 items-center">
            {TABS.slice(0, 2).map((t) => (
              <Tab key={t.href} {...t} active={path.startsWith(t.href)} />
            ))}
            <li className="flex justify-center">
              <button
                type="button"
                onClick={() => open()}
                aria-label="Add a transaction"
                className="-mt-6 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--gold)] text-[var(--on-accent)] shadow-lg"
              >
                <svg width="28" height="28" viewBox="0 0 28 28" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden>
                  <path d="M14 6v16M6 14h16" />
                </svg>
              </button>
            </li>
            {TABS.slice(2).map((t) => (
              <Tab key={t.href} {...t} active={path.startsWith(t.href)} />
            ))}
          </ul>
        </nav>
      </div>
      <AddSheet preset={preset} onClose={() => setPreset(null)} />
    </AddCtx.Provider>
  );
}

function Tab({ href, label, icon: Icon, active }: { href: string; label: string; icon: () => React.ReactNode; active: boolean }) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={`flex min-h-[60px] flex-col items-center justify-center gap-0.5 text-[12px] ${
          active ? "font-bold text-[var(--gold)]" : "text-ink-faint"
        }`}
      >
        <Icon />
        <span>{label}</span>
      </Link>
    </li>
  );
}

const iconBase = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function HomeIcon() {
  return (
    <svg {...iconBase}>
      <path d="M4 11l8-6.5 8 6.5V20a1 1 0 01-1 1h-4.5v-6h-5v6H5a1 1 0 01-1-1z" />
    </svg>
  );
}
function EnvelopeIcon() {
  return (
    <svg {...iconBase}>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3.5 7l8.5 6 8.5-6" />
    </svg>
  );
}
function WalletIcon() {
  return (
    <svg {...iconBase}>
      <path d="M4 7.5A2.5 2.5 0 016.5 5H18v3" />
      <rect x="4" y="8" width="16" height="12" rx="2.5" />
      <circle cx="16" cy="14" r="1.2" fill="currentColor" />
    </svg>
  );
}
function FlagIcon() {
  return (
    <svg {...iconBase}>
      <path d="M5 21V4M5 4.5h11l-2 3.5 2 3.5H5" />
    </svg>
  );
}
