import { cacheLife } from "next/cache";

/** Mid-market USD→KES reference rate, refreshed hourly. Your actual rate is what you enter. */
export async function GET() {
  const rate = await usdKes();
  if (!rate) return Response.json({ error: "rate unavailable" }, { status: 502 });
  return Response.json(rate);
}

async function usdKes(): Promise<{ rate: number; updated: string; source: string } | null> {
  "use cache";
  cacheLife("hours");
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    if (!res.ok) return null;
    const data = await res.json();
    const rate = Number(data?.rates?.KES);
    if (!Number.isFinite(rate) || rate <= 0) return null;
    const updated = data.time_last_update_unix
      ? new Date(data.time_last_update_unix * 1000).toISOString()
      : new Date().toISOString();
    return { rate, updated, source: "open.er-api.com" };
  } catch {
    return null;
  }
}
