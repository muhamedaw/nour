// Web Crypto (`crypto.subtle`), not Node's `crypto` module — this file is
// imported by both a Node route handler and middleware.ts, which runs on
// the Edge runtime and has no access to Node's `crypto`. Web Crypto is
// available in both, so one implementation covers both call sites.

export const STAFF_COOKIE_NAME = "staff_auth";
export const STAFF_SESSION_HOURS = 12;
export const STAFF_SESSION_MAX_AGE_SECONDS = STAFF_SESSION_HOURS * 60 * 60;

function getSecret(): string {
  const secret = process.env.STAFF_PASSWORD;
  if (!secret) throw new Error("STAFF_PASSWORD is not set");
  return secret;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time-ish comparison of two equal-length hex digests. */
function hexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Signed `expiresAt.signature` token — stateless, no session store needed. */
export async function createStaffSessionToken(): Promise<string> {
  const expiresAt = Date.now() + STAFF_SESSION_MAX_AGE_SECONDS * 1000;
  const signature = await hmacHex(getSecret(), String(expiresAt));
  return `${expiresAt}.${signature}`;
}

export async function isValidStaffSessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const [expiresAtStr, signature] = token.split(".");
  if (!expiresAtStr || !signature) return false;

  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

  const expected = await hmacHex(getSecret(), expiresAtStr);
  return hexEqual(expected, signature);
}
