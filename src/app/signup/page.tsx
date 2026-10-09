import Link from "next/link";
import { redirect } from "next/navigation";

import { BrandMark } from "@/components/brand-mark";
import { SignupForm, type SignupMode } from "@/components/signup-form";
import { findOpenInvite } from "@/lib/invites";
import { getCurrentSession } from "@/lib/session";
import { inviteTokenPattern } from "@/lib/signup";

export const metadata = {
  title: "Create an account",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string | string[] }>;
}) {
  const configured = Boolean(process.env.DATABASE_URL);
  let signedIn = false;
  if (configured) {
    try {
      signedIn = Boolean(await getCurrentSession());
    } catch {
      signedIn = false;
    }
  }
  if (signedIn) redirect("/feed");

  const { invite } = await searchParams;
  const token = typeof invite === "string" && inviteTokenPattern.test(invite) ? invite : undefined;
  let inviterName: string | undefined;
  if (configured && token) {
    try {
      inviterName = (await findOpenInvite(token))?.inviterName;
    } catch {
      inviterName = undefined;
    }
  }
  const mode: SignupMode = !configured
    ? "unavailable"
    : invite !== undefined
      ? inviterName ? "invite" : "invalid-invite"
      : process.env.SIGNUP_CODE ? "code" : "closed";

  return (
    <main className="login-page">
      <section className="login-card">
        <BrandMark />
        <div className="login-card__intro">
          <h1>{mode === "invite" ? `Join ${inviterName}` : "Create an account"}</h1>
          {mode === "invite" && <p>{inviterName} invited you to share their places.</p>}
        </div>
        <SignupForm mode={mode} invite={mode === "invite" ? token : undefined} />
        <p className="login-card__switch">Already have an account? <Link href="/login">Sign in</Link></p>
      </section>
    </main>
  );
}
