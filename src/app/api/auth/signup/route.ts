import { NextRequest, NextResponse } from "next/server";

import { getPool } from "@/lib/db";
import { inviteTokenHash, sameSecret } from "@/lib/invites";
import { isSameOriginRequest } from "@/lib/origin";
import { hashPassword } from "@/lib/password";
import { createSession } from "@/lib/session";
import { signupSchema } from "@/lib/signup";

const headers = { "Cache-Control": "private, no-store" };

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers });
}

class SignupError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/**
 * Create an account. Without an invite it starts a new, empty private space and needs the sign-up
 * code set on the server (no code set means sign-up is closed). With an invite link it joins the
 * inviting owner's space as the second member, and the link stops working.
 */
export async function POST(request: NextRequest) {
  if (!process.env.DATABASE_URL) return error("Sign-up is not set up yet.", 503);
  if (!isSameOriginRequest(request)) return error("Request not allowed.", 403);
  const parsed = signupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return error(parsed.error.issues[0]?.message ?? "Check the form and try again.", 400);
  const { name, email, password, code, invite } = parsed.data;

  if (!invite) {
    const signupCode = process.env.SIGNUP_CODE;
    if (!signupCode) return error("Sign-up is closed. Our Places is invite-only.", 403);
    if (!code || !sameSecret(code, signupCode)) return error("That sign-up code isn't right.", 403);
  }

  let client;
  try {
    const passwordHash = await hashPassword(password);
    client = await getPool().connect();
    await client.query("begin");
    let spaceId: string;
    let role: "owner" | "partner";
    if (invite) {
      const found = await client.query<{ id: string; space_id: string }>(
        `select i.id, i.space_id from space_invites i
          where i.token_hash = $1 and i.used_at is null and i.expires_at > now()
            and not exists (select 1 from space_members m where m.space_id = i.space_id and m.role = 'partner')
          for update`,
        [inviteTokenHash(invite)],
      );
      if (!found.rows[0]) throw new SignupError("This invite link has expired or was already used. Ask for a new one.", 410);
      spaceId = found.rows[0].space_id;
      role = "partner";
      await client.query("update space_invites set used_at = now() where id = $1", [found.rows[0].id]);
    } else {
      const space = await client.query<{ id: string }>("insert into spaces (name) values ('Our Places') returning id");
      spaceId = space.rows[0].id;
      role = "owner";
    }
    const user = await client.query<{ id: string }>(
      `insert into app_users (email, display_name, password_hash) values ($1, $2, $3)
       on conflict (email) do nothing returning id`,
      [email, name, passwordHash],
    );
    if (!user.rows[0]) throw new SignupError("An account with this email already exists. Sign in instead.", 409);
    await client.query("insert into space_members (space_id, user_id, role) values ($1, $2, $3)", [spaceId, user.rows[0].id, role]);
    await client.query("commit");
    await createSession(user.rows[0].id);
    return NextResponse.json({ ok: true, role }, { headers });
  } catch (problem) {
    await client?.query("rollback").catch(() => undefined);
    if (problem instanceof SignupError) return error(problem.message, problem.status);
    return error("Sign-up is temporarily unavailable. Please try again.", 503);
  } finally {
    client?.release();
  }
}
