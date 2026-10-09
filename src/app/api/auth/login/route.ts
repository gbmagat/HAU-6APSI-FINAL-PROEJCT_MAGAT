import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { isSameOriginRequest } from "@/lib/origin";
import { hashPassword, verifyPassword } from "@/lib/password";
import { createSession } from "@/lib/session";

const credentialsSchema = z.object({
  email: z.email().max(254).transform((value) => value.trim().toLowerCase()),
  password: z.string().min(1).max(256),
});

type UserRow = {
  id: string;
  password_hash: string;
  failed_login_count: number;
  locked_until: Date | null;
};

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: NextRequest) {
  if (!process.env.DATABASE_URL) return error("Sign-in is not set up yet.", 503);
  if (!isSameOriginRequest(request)) return error("Request not allowed.", 403);
  const parsed = credentialsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return error("Enter a valid email and password.", 400);

  try {
    const pool = getPool();
    const { rows } = await pool.query<UserRow>(
      "select id, password_hash, failed_login_count, locked_until from app_users where email = $1",
      [parsed.data.email],
    );
    const user = rows[0];
    if (user?.locked_until && user.locked_until > new Date()) {
      return error("Too many attempts. Please try again in 15 minutes.", 429);
    }

    // Keep unknown email attempts expensive too, without revealing whether an account exists.
    const valid = user
      ? await verifyPassword(parsed.data.password, user.password_hash)
      : (await hashPassword(parsed.data.password.padEnd(12, "x")), false);

    if (!user || !valid) {
      if (user) {
        await pool.query(
          `with next_attempt as (
             select case when locked_until <= now() then 1 else failed_login_count + 1 end as count
               from app_users where id = $1
           )
           update app_users set failed_login_count = next_attempt.count,
             locked_until = case when next_attempt.count >= 5 then now() + interval '15 minutes' else null end
             from next_attempt where app_users.id = $1`,
          [user.id],
        );
      }
      return error("The email or password isn’t correct.", 401);
    }

    await pool.query(
      "update app_users set failed_login_count = 0, locked_until = null where id = $1",
      [user.id],
    );
    await createSession(user.id);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return error("Sign-in is temporarily unavailable. Please try again.", 503);
  }
}
