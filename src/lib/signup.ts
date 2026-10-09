import { z } from "zod";

/** How long a partner invite link works. */
export const INVITE_DAYS = 7;

export const inviteTokenPattern = /^[A-Za-z0-9_-]{20,100}$/;

/**
 * Creating an account either starts a new private space (with the sign-up code) or joins the
 * space of the owner who sent the invite link.
 */
export const signupSchema = z.strictObject({
  name: z.string().trim().min(1, "Enter your name.").max(80, "Use a name of 80 characters or fewer."),
  email: z.email("Enter a valid email address.").max(254).transform((value) => value.trim().toLowerCase()),
  password: z.string().min(12, "Use at least 12 characters for your password.").max(256),
  code: z.string().trim().max(200).optional(),
  invite: z.string().regex(inviteTokenPattern, "This invite link isn't valid.").optional(),
});

export type SignupInput = z.infer<typeof signupSchema>;
