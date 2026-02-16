import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "../config.js";

const JWKS = createRemoteJWKSet(
  new URL(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`),
);

export async function verifySupabaseJwt(token: string) {
  const { payload } = await jwtVerify(token, JWKS);
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
