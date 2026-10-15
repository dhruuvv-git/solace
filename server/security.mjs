/**
 * Password hashing and token helpers. Node's built-in crypto only — no native
 * dependencies, so the server installs and runs the same on Windows, macOS and Linux.
 *
 * Passwords: scrypt (N=2^15, r=8, p=1), 16-byte random salt, 64-byte key.
 * Stored as "scrypt$N$r$p$saltB64$hashB64". Verification is constant-time.
 * Tokens (sessions, device tokens, link codes): 32 random bytes, base64url.
 * Only SHA-256(token) is stored, so a leaked database cannot be replayed.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);
const N = 2 ** 15, R = 8, P = 1, KEYLEN = 64;
const MAXMEM = 64 * 1024 * 1024;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize('NFKC'), salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${Buffer.from(key).toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, 'base64');
  const key = await scrypt(password.normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n), r: Number(r), p: Number(p), maxmem: MAXMEM,
  });
  return expected.length === key.length && timingSafeEqual(expected, Buffer.from(key));
}

/** A password hash computed once at startup, used to keep sign-in timing equal for unknown emails. */
let dummyHash = null;
export async function dummyVerify(password) {
  dummyHash ??= await hashPassword('timing-equaliser-not-a-real-password');
  await verifyPassword(password, dummyHash);
  return false;
}

export const newToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const newId = () => randomBytes(12).toString('base64url');
export const sha256 = (s) => createHash('sha256').update(s).digest('hex');

/** Short human-friendly code is not needed: link codes travel page → extension, never typed. */
export const newLinkCode = () => newToken(24);
