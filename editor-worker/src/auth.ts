/**
 * Stateless, signed session tokens for the ADMIN endpoints.
 *
 * Ordinary editing needs none of this. A pilot correcting a wind band
 * never signs in - see src/domain/contributor.ts. What a session buys is
 * the admin layer (revert, hide, block) and a marker in the edit log
 * saying a change was made by an admin rather than by a contributor.
 *
 * Adapted from the admin-experiment prototype's worker/auth.ts (same
 * HMAC-SHA256 approach, same no-session-store design) with one deliberate
 * change: the session is a bearer token in an Authorization header, not a
 * cookie. That prototype has since been deleted - see git history before
 * 2026-09-18 if the original is ever wanted.
 *
 * Cookies were right when the prototype served its own frontend from one
 * origin. Here the website is on GitHub Pages and the Worker is on a
 * different host, which makes any session cookie a third-party cookie -
 * blocked outright by Safari's tracking prevention, which is to say
 * blocked on the iPhone this has to work from. A bearer token is
 * unaffected by cookie policy and cannot be sent by a cross-site form, so
 * it is also immune to CSRF.
 *
 * What is NOT stored in the browser is the GitHub credential. That lives
 * only in Worker secrets; the token below authorises a request to the
 * Worker, and the Worker alone can write to the repository. Rotating
 * SESSION_SECRET invalidates every outstanding session at once.
 */

const SESSION_TTL_SECONDS = 12 * 60 * 60;

export interface SessionPayload {
  /** Who the session belongs to - one operator today, a real check already. */
  sub: string;
  /** Unix seconds. */
  exp: number;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return base64UrlEncode(new Uint8Array(signature));
}

/** Length-independent compare, so a wrong password cannot be probed by timing. */
function constantTimeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < Math.max(ab.length, bb.length); i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

/**
 * Surrounding whitespace is stripped from BOTH sides before comparing.
 *
 * Not laziness - two real failure modes otherwise present as "incorrect
 * password" with nothing to debug. `wrangler secret put` fed from a pipe
 * or a file captures the trailing newline, so the stored secret ends in
 * one and can never be typed. And phone keyboards routinely append a
 * space after an autocompleted or pasted value.
 *
 * The security cost is that " hunter2 " also opens the door, which is
 * worth essentially nothing to an attacker who must already know
 * "hunter2". The comparison itself stays length-independent.
 */
export function passwordMatches(candidate: unknown, expected: string): boolean {
  if (typeof candidate !== "string") return false;
  const want = expected.trim();
  if (want.length === 0) return false;
  return constantTimeEqual(candidate.trim(), want);
}

export async function issueToken(sub: string, secret: string, now: Date = new Date()): Promise<{
  token: string;
  expiresAt: string;
}> {
  const exp = Math.floor(now.getTime() / 1000) + SESSION_TTL_SECONDS;
  const payload: SessionPayload = { sub, exp };
  const encoded = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await sign(encoded, secret);
  return { token: `${encoded}.${signature}`, expiresAt: new Date(exp * 1000).toISOString() };
}

export async function verifyToken(
  token: string | null,
  secret: string,
  now: Date = new Date(),
): Promise<SessionPayload | null> {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  const expected = await sign(encoded, secret);
  if (!constantTimeEqual(signature, expected)) return null;

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(encoded))) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp * 1000 <= now.getTime()) return null;
    if (typeof payload.sub !== "string" || payload.sub.length === 0) return null;
    return payload;
  } catch {
    return null;
  }
}

export function bearerFrom(request: Request): string | null {
  const header = request.headers.get("Authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1] : null;
}
