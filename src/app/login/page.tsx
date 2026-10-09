import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { LoginForm } from "@/components/login-form";
import { getCurrentSession } from "@/lib/session";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Private sign in",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string | string[] }>;
}) {
  const configured = Boolean(process.env.DATABASE_URL);
  const allowPreview = process.env.NODE_ENV !== "production";
  const signupOpen = configured && Boolean(process.env.SIGNUP_CODE);
  let signedIn = false;
  let sessionUnavailable = false;
  if (configured) {
    try {
      signedIn = Boolean(await getCurrentSession());
    } catch {
      sessionUnavailable = true;
    }
  }
  if (signedIn) redirect("/feed");
  const { reason } = await searchParams;
  let notice: string | undefined;

  if (!configured || reason === "setup") {
    notice = "Our Places is not ready for sign-in yet. Please check back soon.";
  } else if (reason === "membership") {
    notice = "This account does not have access to Our Places. Please use your invited account.";
  } else if (reason === "unavailable" || sessionUnavailable) {
    notice = "We couldn’t check your access. Please try again shortly.";
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <BrandMark />
        <div className="login-card__intro">
          <h1>Welcome back</h1>
        </div>
        <LoginForm configured={configured} allowPreview={allowPreview} notice={notice} />
        {signupOpen && <p className="login-card__switch">New here? <Link href="/signup">Create an account</Link></p>}
      </section>
    </main>
  );
}
