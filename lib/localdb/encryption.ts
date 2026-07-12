/**
 * Password-protected encryption for automatic DB backup/restore.
 *
 * Uses AES-256-GCM via Web Crypto API with a key derived from the staff
 * password (PBKDF2 → AES-GCM key).  The encrypted blob includes
 * a random IV + the ciphertext, packed as a single Uint8Array:
 *
 *   [ 32-byte salt  |  12-byte IV  |  ciphertext ]
 *
 * The salt is used for PBKDF2 key derivation so the same password never
 * produces the same encryption key — this prevents IV-reuse weaknesses
 * and makes it harder to correlate backups by their encrypted content.
 *
 * TS note: TypeScript 5.7+ tightened the `ArrayBuffer` ↔ `ArrayBufferLike`
 * distinction so `Uint8Array` is no longer directly assignable to
 * `BufferSource` without a cast. The `as BufferSource` casts at each
 * crypto.subtle.* call site are safe at runtime — the underlying Web
 * Crypto API accepts any `BufferSource` (ArrayBuffer or ArrayBufferView).
 */

const ITERATIONS = 600_000; // OWASP 2023 recommended minimum for PBKDF2-HMAC-SHA256

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password) as BufferSource,
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/** Encrypt `plaintext` (arbitrary bytes) with `password`. */
export async function encryptBackup(password: string, plaintext: Uint8Array): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      plaintext as BufferSource
    )
  );

  const packed = new Uint8Array(salt.length + iv.length + ciphertext.length);
  packed.set(salt, 0);
  packed.set(iv, salt.length);
  packed.set(ciphertext, salt.length + iv.length);
  return packed;
}

/** Decrypt `packed` (salt+iv+ciphertext) with `password`.  Returns null on wrong password or corruption. */
export async function decryptBackup(
  password: string,
  packed: Uint8Array
): Promise<Uint8Array | null> {
  try {
    const salt = packed.slice(0, 32);
    const iv = packed.slice(32, 44);
    const ciphertext = packed.slice(44);

    const key = await deriveKey(password, salt);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      ciphertext as BufferSource
    );
    return new Uint8Array(plaintext);
  } catch {
    return null; // wrong password or corrupted data
  }
}
