import * as users from "../models/users";
import {
  SESSION_COOKIE,
  clearedCookie,
  createToken,
  parseCookies,
  readToken,
  sessionCookie,
} from "../components/auth/session";
import { error, ok } from "./helpers";

/** Cookies only travel over https once the app is actually served over https. */
const secure = () => process.env.NODE_ENV === "production";

/**
 * Who is making this request, from the session cookie. Null when the cookie is
 * missing, forged or expired — the caller turns that into a 401.
 */
export async function authenticate(
  cookieHeader: string | undefined,
): Promise<{ id: number } | null> {
  const token = parseCookies(cookieHeader)[SESSION_COOKIE];
  if (!token) return null;
  const userId = readToken(token);
  if (!userId) return null;
  // the account may have been deleted since the token was signed
  const user = await users.get(userId);
  return user ? { id: user.id } : null;
}

export const authApi = {
  login: async (body: { email?: string; password?: string }) => {
    const email = (body?.email ?? "").trim();
    const password = body?.password ?? "";
    if (!email || !password) {
      return error(400, "email and password are required");
    }

    const found = await users.byEmailWithHash(email);
    // one message for both halves: which of the two was wrong is not the
    // caller's business
    if (!found || !users.verifyPassword(password, found.passwordHash)) {
      return error(401, "invalid email or password");
    }

    return {
      ...ok({ user: found.user }),
      cookie: sessionCookie(createToken(found.user.id), secure()),
    };
  },

  logout: async () => ({ ...ok({ ok: true }), cookie: clearedCookie(secure()) }),

  me: async (userId: number) => {
    const user = await users.get(userId);
    return user ? ok({ user }) : error(401, "not signed in");
  },
};
