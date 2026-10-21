"use server";

import { createClient } from "@supabase/supabase-js";

export type CodeRequest = { ok: true } | { ok: false; message: string };

const RESEND_COOLDOWN_MS = 60_000;

/**
 * Emails a one-time code — only to the one allowed address.
 * The code is generated with the Supabase admin API and sent through Resend, so no
 * Supabase email template (or custom SMTP) is needed. The browser then verifies it
 * with supabase.auth.verifyOtp.
 */
export async function requestCode(email: string): Promise<CodeRequest> {
  const normalized = email.trim().toLowerCase();
  const allowed = (process.env.ALLOWED_EMAIL ?? "").trim().toLowerCase();
  if (!allowed || normalized !== allowed) {
    return { ok: false, message: "This Mali Maker belongs to someone else. Check the email address." };
  }
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!serviceKey || !resendKey) {
    console.error("requestCode: SUPABASE_SERVICE_ROLE_KEY or RESEND_API_KEY is not set");
    return { ok: false, message: "Login isn't set up yet on the server. (Missing keys.)" };
  }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Single-user app: find (or create) the account, and don't resend within a minute.
  const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 50 });
  if (listError) return failed("listUsers", listError);
  const user = list.users.find((u) => u.email?.toLowerCase() === normalized);
  if (user?.recovery_sent_at && Date.now() - Date.parse(user.recovery_sent_at) < RESEND_COOLDOWN_MS) {
    return { ok: false, message: "A code was sent less than a minute ago. Check your inbox, or try again shortly." };
  }
  if (!user) {
    const { error } = await admin.auth.admin.createUser({ email: normalized, email_confirm: true });
    if (error) return failed("createUser", error);
  }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: normalized,
  });
  const code = link?.properties?.email_otp;
  if (linkError || !code) return failed("generateLink", linkError);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "Mali Maker <onboarding@resend.dev>",
      to: [normalized],
      subject: `${code} is your Mali Maker code`,
      text: `Your Mali Maker code is ${code}\n\nType it into the app. It works for one hour.`,
      html: `<div style="font-family:system-ui,sans-serif;font-size:16px;color:#14231d">
  <p>Your Mali Maker code:</p>
  <p style="font-size:32px;letter-spacing:6px;font-weight:700;margin:12px 0">${code}</p>
  <p style="color:#627369">Type it into the app. It works for one hour.</p>
</div>`,
    }),
  });
  if (!res.ok) return failed("resend", `${res.status} ${await res.text()}`);
  return { ok: true };
}

function failed(step: string, detail: unknown): CodeRequest {
  console.error(`requestCode ${step} failed:`, detail);
  return { ok: false, message: "Couldn't send a code right now. Try again in a moment." };
}
