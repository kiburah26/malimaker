const kesFmt = new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 });
const usdFmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 12,345 (no currency label — the app is KES unless it says otherwise). */
export const kes = (n: number) => kesFmt.format(Math.round(n));
/** KES 12,345 */
export const kesL = (n: number) => `KES ${kes(n)}`;
/** Signed, for changes: +1,200 / −450 */
export const kesSigned = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + kes(Math.abs(n));
export const usd = (n: number) => `$${usdFmt.format(n)}`;
export const money = (n: number, currency: "KES" | "USD") => (currency === "USD" ? usd(n) : kesL(n));

/** Short compact form for tight spaces: 1.2M, 85k, 950 */
export function kesShort(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (a >= 1_000_000) return `${sign}${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 2).replace(/\.?0+$/, "")}M`;
  if (a >= 10_000) return `${sign}${Math.round(a / 1000)}k`;
  if (a >= 1000) return `${sign}${(a / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${sign}${Math.round(a)}`;
}

const dayFmt = new Intl.DateTimeFormat("en-KE", { timeZone: "Africa/Nairobi", weekday: "short", day: "numeric", month: "short" });
const timeFmt = new Intl.DateTimeFormat("en-KE", { timeZone: "Africa/Nairobi", hour: "numeric", minute: "2-digit" });
const monthFmt = new Intl.DateTimeFormat("en-KE", { timeZone: "UTC", month: "long", year: "numeric" });
const monthShortFmt = new Intl.DateTimeFormat("en-KE", { timeZone: "UTC", month: "short", year: "numeric" });
const dateFmt = new Intl.DateTimeFormat("en-KE", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });

export const fmtDay = (iso: string) => dayFmt.format(new Date(iso));
export const fmtTime = (iso: string) => timeFmt.format(new Date(iso));
/** "2026-10" → "October 2026" */
export const fmtMonth = (key: string) => monthFmt.format(new Date(key + "-01T00:00:00Z"));
export const fmtMonthShort = (key: string) => monthShortFmt.format(new Date(key + "-01T00:00:00Z"));
/** "2027-03-30" → "30 Mar 2027" */
export const fmtDate = (key: string) => dateFmt.format(new Date(key + "T00:00:00Z"));

/** Parses what people type: "1,500", "1500.50", "1.5k". */
export function parseAmount(raw: string): number {
  const s = raw.trim().toLowerCase().replace(/[,\s]/g, "").replace(/^ksh|^kes|^\$/, "");
  if (!s) return NaN;
  const k = s.endsWith("k");
  const n = Number(k ? s.slice(0, -1) : s);
  return k ? n * 1000 : n;
}

/** <input type="datetime-local"> value for now, in Nairobi time. */
export function nairobiLocalInput(d = new Date()): string {
  return new Date(d.getTime() + 3 * 3_600_000).toISOString().slice(0, 16);
}
/** And back to an ISO timestamp. */
export const fromNairobiLocal = (v: string) => new Date(v + ":00+03:00").toISOString();
