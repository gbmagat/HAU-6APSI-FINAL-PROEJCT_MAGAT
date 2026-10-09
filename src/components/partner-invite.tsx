"use client";

import { Copy, UserPlus } from "lucide-react";
import { useState } from "react";

import { usePassport } from "@/components/passport-provider";
import { INVITE_DAYS } from "@/lib/signup";

/** For an owner whose space has no partner yet: a one-time link to invite them. */
export function PartnerInvite() {
  const { serverMode, members, currentMember } = usePassport();
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  if (!serverMode || currentMember.role !== "owner" || members.length >= 2) return null;

  async function createLink() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/invites", { method: "POST", credentials: "same-origin" });
      const data = await response.json().catch(() => null) as { token?: string; error?: string } | null;
      if (!response.ok || !data?.token) throw new Error(data?.error || "The invite link could not be created.");
      setLink(`${window.location.origin}/signup?invite=${data.token}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The invite link could not be created.");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setMessage("Link copied.");
    } catch {
      setMessage("Select the link and copy it.");
    }
  }

  return (
    <section className="settings-panel frontend-panel" aria-labelledby="partner-invite-title">
      <header>
        <div>
          <UserPlus size={23} aria-hidden="true" />
          <div>
            <h2 id="partner-invite-title">Invite your partner</h2>
            <p>Our Places is for two. Send this link to the person you share it with; it works once, for {INVITE_DAYS} days.</p>
          </div>
        </div>
      </header>
      {link ? (
        <div className="invite-link">
          <label className="sr-only" htmlFor="partner-invite-link">Invite link</label>
          <input id="partner-invite-link" readOnly value={link} onFocus={(event) => event.currentTarget.select()} />
          <button type="button" className="button button--secondary" onClick={() => void copyLink()}>
            <Copy size={16} aria-hidden="true" /> Copy
          </button>
        </div>
      ) : (
        <button type="button" className="button button--primary" onClick={() => void createLink()} disabled={busy}>
          <UserPlus size={17} aria-hidden="true" /> {busy ? "Creating…" : "Create invite link"}
        </button>
      )}
      {message && <p className="form-status" role="status">{message}</p>}
    </section>
  );
}
