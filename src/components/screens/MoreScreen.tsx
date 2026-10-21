"use client";

import Link from "next/link";

const LINKS = [
  { href: "/convert", title: "Convert", blurb: "USD ⇄ KES rate, calculator, and what your conversions really cost" },
  { href: "/history", title: "History", blurb: "Every transaction by month, including your Money Manager history" },
  { href: "/plan", title: "Plan", blurb: "Your split, envelope targets, and where you'd be at different pay levels" },
  { href: "/settings", title: "Settings", blurb: "Theme, export, sign out" },
];

export function MoreScreen() {
  return (
    <div className="pt-2">
      <h1 className="font-display text-3xl">More</h1>
      <ul className="card ruled mt-4 px-4">
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="flex items-center justify-between gap-3 py-4">
              <span>
                <span className="block font-bold">{l.title}</span>
                <span className="text-[14px] text-ink-soft">{l.blurb}</span>
              </span>
              <span aria-hidden className="text-2xl text-ink-faint">›</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
