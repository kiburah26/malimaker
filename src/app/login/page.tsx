"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { requestCode } from "./actions";

export default function LoginPage() {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const res = await requestCode(email);
    setBusy(false);
    if (res.ok) {
      setStep("code");
      setTimeout(() => codeRef.current?.focus(), 50);
    } else {
      setMessage(res.message);
    }
  }

  async function verify(token: string) {
    setBusy(true);
    setMessage(null);
    const address = email.trim().toLowerCase();
    let { error } = await supabase().auth.verifyOtp({ email: address, token, type: "email" });
    if (error) {
      // Codes are generated as magic-link OTPs; older auth servers only accept that type.
      ({ error } = await supabase().auth.verifyOtp({ email: address, token, type: "magiclink" }));
    }
    if (error) {
      setBusy(false);
      setCode("");
      setMessage("That code didn't work. Codes expire after an hour — check the newest email.");
      return;
    }
    window.location.replace("/home");
  }

  function onCodeChange(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 8);
    setCode(digits);
    if (digits.length === 6) verify(digits);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 pt-safe pb-safe">
      <div className="mb-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" width={64} height={64} className="mb-6 rounded-2xl" />
        <h1 className="font-display text-4xl">Mali Maker</h1>
        <p className="mt-2 text-ink-soft">Every shilling has a job.</p>
      </div>

      {step === "email" ? (
        <form onSubmit={sendCode} className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-ink-soft">Your email</span>
            <input
              className="field"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <button className="btn btn-primary w-full" disabled={busy || !email}>
            {busy ? "Sending…" : "Send me a code"}
          </button>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (code.length >= 6) verify(code);
          }}
          className="space-y-4"
        >
          <label className="block">
            <span className="mb-2 block text-ink-soft">
              Type the 6-digit code sent to <strong className="text-ink">{email}</strong>
            </span>
            <input
              ref={codeRef}
              className="field num text-center text-3xl tracking-[0.4em]"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={8}
              value={code}
              onChange={(e) => onCodeChange(e.target.value)}
              aria-label="One-time code"
            />
          </label>
          <button className="btn btn-primary w-full" disabled={busy || code.length < 6}>
            {busy ? "Checking…" : "Open Mali Maker"}
          </button>
          <button
            type="button"
            className="btn w-full text-ink-soft"
            onClick={() => {
              setStep("email");
              setCode("");
              setMessage(null);
            }}
          >
            Use a different email or resend
          </button>
        </form>
      )}

      {message && (
        <p role="alert" className="mt-5 text-ink-soft">
          {message}
        </p>
      )}
    </main>
  );
}
