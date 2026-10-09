"use client";

import { LockKeyhole, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { signupSchema } from "@/lib/signup";

export type SignupMode = "code" | "invite" | "invalid-invite" | "closed" | "unavailable";

const closedMessages: Partial<Record<SignupMode, string>> = {
  closed: "Sign-up is closed. Our Places is invite-only, so ask the person you share it with for an invite link.",
  "invalid-invite": "This invite link has expired or was already used. Ask for a new one.",
  unavailable: "Our Places is not ready for sign-up yet. Please check back soon.",
};

export function SignupForm({ mode, invite }: { mode: SignupMode; invite?: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const open = mode === "code" || mode === "invite";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !open) return;
    const body = { name, email: email.trim(), password, ...(mode === "code" ? { code } : { invite }) };
    const parsed = signupSchema.safeParse(body);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the form and try again.");
      return;
    }
    if (mode === "code" && !code.trim()) {
      setError("Enter the sign-up code you were given.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => null) as { role?: "owner" | "partner"; error?: string } | null;
      if (!response.ok) {
        setError(data?.error ?? "We couldn't create your account. Please try again shortly.");
        setSubmitting(false);
        return;
      }
      // A new owner's next step is inviting their partner, which lives in Profile.
      router.replace(data?.role === "owner" ? "/profile" : "/feed");
      router.refresh();
    } catch {
      setError("We couldn't reach sign-up. Please check your connection and try again.");
      setSubmitting(false);
    }
  }

  if (!open) {
    return <p className="field-error" role="status">{closedMessages[mode]}</p>;
  }

  return (
    <form onSubmit={submit} noValidate aria-busy={submitting}>
      <label className="field">
        <span>Your name</span>
        <input autoComplete="name" value={name} maxLength={80} disabled={submitting} required onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="field">
        <span>Email</span>
        <input type="email" autoComplete="email" value={email} disabled={submitting} required placeholder="you@example.com" onChange={(event) => setEmail(event.target.value)} />
      </label>
      <label className="field">
        <span>Password</span>
        <input type="password" autoComplete="new-password" value={password} minLength={12} disabled={submitting} required aria-describedby="password-hint" onChange={(event) => setPassword(event.target.value)} />
        <small id="password-hint" className="field-hint">At least 12 characters.</small>
      </label>
      {mode === "code" && (
        <label className="field">
          <span>Sign-up code</span>
          <input autoComplete="off" value={code} disabled={submitting} required onChange={(event) => setCode(event.target.value)} />
        </label>
      )}
      {error && <p className="field-error" role="alert">{error}</p>}
      <button type="submit" className="button button--primary button--full" disabled={submitting}>
        <UserPlus size={18} aria-hidden="true" />
        {submitting ? "Creating your account…" : "Create account"}
      </button>
      <p className="privacy-note">
        <LockKeyhole size={17} aria-hidden="true" />
        {mode === "invite" ? "You'll share one private space with them." : "You get your own private space, for you and one partner."}
      </p>
    </form>
  );
}
