import { NextRequest, NextResponse } from "next/server";

import { apiError, apiSession } from "@/lib/api-session";
import { getPool } from "@/lib/db";
import { inviteTokenHash, newInviteToken } from "@/lib/invites";
import { INVITE_DAYS } from "@/lib/signup";

/** The owner creates a one-time link for the second member. A new link replaces any unused one. */
export async function POST(request: NextRequest) {
  try {
    const auth = await apiSession(request);
    if (auth.error) return auth.error;
    const { spaceId, userId, role } = auth.session;
    if (role !== "owner") return apiError("Only the owner of this space can invite a partner.", 403);
    const pool = getPool();
    const partner = await pool.query("select 1 from space_members where space_id = $1 and role = 'partner'", [spaceId]);
    if (partner.rowCount) return apiError("This space already has its two members.", 409);

    const token = newInviteToken();
    const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000);
    await pool.query("delete from space_invites where space_id = $1 and used_at is null", [spaceId]);
    await pool.query(
      "insert into space_invites (space_id, token_hash, created_by, expires_at) values ($1, $2, $3, $4)",
      [spaceId, inviteTokenHash(token), userId, expiresAt],
    );
    return NextResponse.json({ token, expiresAt: expiresAt.toISOString() }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return apiError("The invite link could not be created. Please try again.", 503);
  }
}
