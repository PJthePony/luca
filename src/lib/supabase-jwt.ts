import { jwtVerify } from "jose";
import { env } from "../config.js";

const secret = new TextEncoder().encode(env.SUPABASE_JWT_SECRET);

export async function verifySupabaseJwt(token: string) {
  const { payload } = await jwtVerify(token, secret, {
    algorithms: ["HS256"],
  });
  return {
    sub: payload.sub as string,
    email: payload.email as string,
    userMetadata: (payload.user_metadata as Record<string, unknown>) ?? {},
  };
}

export function parseCookie(
  cookieHeader: string | undefined,
  name: string,
): string | undefined {
  return cookieHeader
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${name}=`))
    ?.split("=")
    .slice(1)
    .join("=");
}
