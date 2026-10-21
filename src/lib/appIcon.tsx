import { ImageResponse } from "next/og";

const BG = "#0e1714";
const GOLD = "#e8c26a";
const MINT = "#7fd6a4";

/** The app icon: three rising gold bars with a mint sprout on the tallest. */
export function appIcon(size: number, { maskable = false } = {}) {
  const scale = maskable ? 0.7 : 1; // keep the mark inside the maskable safe zone
  const t = `translate(256 256) scale(${scale}) translate(-256 -256)`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: BG }}>
        <svg width={size} height={size} viewBox="0 0 512 512">
          <g transform={t}>
            <rect x="120" y="292" width="64" height="112" rx="14" fill={GOLD} opacity="0.7" />
            <rect x="224" y="236" width="64" height="168" rx="14" fill={GOLD} opacity="0.85" />
            <rect x="328" y="172" width="64" height="232" rx="14" fill={GOLD} />
            <path d="M360 172 C360 140 360 124 360 108" stroke={MINT} strokeWidth="14" strokeLinecap="round" fill="none" />
            <path d="M360 128 C384 128 404 110 408 84 C382 84 362 100 360 128 Z" fill={MINT} />
            <path d="M360 140 C338 140 320 126 316 104 C340 104 358 118 360 140 Z" fill={MINT} opacity="0.8" />
          </g>
        </svg>
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=604800, immutable" } },
  );
}
