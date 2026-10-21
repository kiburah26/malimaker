import { appIcon } from "@/lib/appIcon";

const ICONS: Record<string, Parameters<typeof appIcon>> = {
  "icon-192.png": [192],
  "icon-512.png": [512],
  "maskable-512.png": [512, { maskable: true }],
};

export function generateStaticParams() {
  return Object.keys(ICONS).map((file) => ({ file }));
}

export async function GET(_req: Request, ctx: RouteContext<"/icons/[file]">) {
  const { file } = await ctx.params;
  const args = ICONS[file];
  if (!args) return new Response("Not found", { status: 404 });
  return appIcon(...args);
}
