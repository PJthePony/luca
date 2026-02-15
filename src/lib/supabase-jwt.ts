import { jwtVerify } from "jose";
import { createSecretKey } from "node:crypto";
import { env } from "../config.js";

const secret = createSecretKey(Buffer.from(env.SUPABASE_JWT_SECRET, "base64"));

export async function verifySupabaseJwt(token: string) {
  const { payload } = await jwtVerify(token, secret);
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
