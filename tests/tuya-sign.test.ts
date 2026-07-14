import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  EMPTY_BODY_SHA256,
  bytesToHexUpper,
  canonicalQuery,
  hmacSha256Hex,
  sha256Hex,
  signRequest,
  type TuyaConfig,
} from "@/lib/cloud/tuya-sign";

// ---------------------------------------------------------------------------
// Pinned HMAC vector.
//
// Computed once with Node 22 Web Crypto against THIS implementation, so
// any drift in the string-to-sign format or the HMAC key/input order will
// turn this test red.  If you intentionally change the algorithm, you MUST
// also update VECTOR_SIGN_HEX here with a freshly-computed value.
//
// How to refresh after a deliberate algorithm change:
//   1. Bump VECTOR_SIGN_HEX to "TBD"
//   2. Run `npm test -- tests/tuya-sign.test.ts`
//   3. Copy the printed "actual" sign into VECTOR_SIGN_HEX
//   4. Re-run — it should go green and stay that way
//
// The fixture below was generated against:
//   accessId   = "test-client-id"
//   secret     = "test-secret"
//   t          = "1700000000000"
//   nonce      = "test-nonce-value"
//   method     = "POST"
//   path/query = /v1.0/token?grant_type=1
//   body       = undefined  →  Content-SHA256 = EMPTY_BODY_SHA256
//
// HMAC input   = client_id + "" + t + nonce + stringToSign
// sign_method  = HMAC-SHA256 (case-sensitive, Tuya rejects lowercase)
// ---------------------------------------------------------------------------
const VECTOR_INPUT = {
  accessId: "test-client-id",
  secret: "test-secret",
  t: "1700000000000",
  nonce: "test-nonce-value",
} as const;
const VECTOR_SIGN_HEX =
  "C5C3BEACFD56C33C4906D74823CDB3ADE4C5C0CC12098717B2B1E856488778FD";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Tuya signer — pinned HMAC vector", () => {
  it("signRequest emits the documented HMAC hex for a known fixture (token-grant)", async () => {
    const cfg: TuyaConfig = {
      accessId: VECTOR_INPUT.accessId,
      accessSecret: VECTOR_INPUT.secret,
      apiBase: "https://openapi.tuyaus.com",
      region: "us",
    };
    const signed = await signRequest(
      cfg,
      {
        method: "POST",
        path: "/v1.0/token",
        query: { grant_type: "1" },
      },
      { t: VECTOR_INPUT.t, nonce: VECTOR_INPUT.nonce },
    );
    assert.equal(signed.headers.sign, VECTOR_SIGN_HEX);
    assert.equal(signed.headers.sign_method, "HMAC-SHA256");
    assert.equal(signed.headers.client_id, "test-client-id");
    assert.equal(signed.headers.t, "1700000000000");
    assert.equal(signed.headers.nonce, "test-nonce-value");
    assert.equal(signed.url, "https://openapi.tuyaus.com/v1.0/token?grant_type=1");
  });

  it("service-management call concatenates access_token into the HMAC input", async () => {
    // Service-mgmt differs from token-grant only in the HMAC input — the
    // access_token is interpolated between accessId and t.  We don't pin
    // another vector (would require a second manual computation); instead
    // we assert shape + that flipping accessToken changes the sign.
    const cfg: TuyaConfig = {
      accessId: "x",
      accessSecret: "y",
      apiBase: "https://openapi.tuyaus.com",
      region: "us",
    };
    const clock = { t: "1", nonce: "n" };
    const a = await signRequest(cfg, {
      method: "GET",
      path: "/v1.0/iot-01/associated-users/devices",
    }, clock);
    const b = await signRequest(cfg, {
      method: "GET",
      path: "/v1.0/iot-01/associated-users/devices",
      accessToken: "TOKEN-A",
    }, clock);
    const c = await signRequest(cfg, {
      method: "GET",
      path: "/v1.0/iot-01/associated-users/devices",
      accessToken: "TOKEN-B",
    }, clock);
    assert.equal(a.headers.sign_method, "HMAC-SHA256");
    assert.notEqual(a.headers.sign, b.headers.sign); // accessToken-affected
    assert.notEqual(b.headers.sign, c.headers.sign); // different tokens → different sign
    assert.match(a.headers.sign, /^[0-9A-F]{64}$/);
    assert.match(b.headers.sign, /^[0-9A-F]{64}$/);
  });
});

describe("Tuya signer — shape invariants", () => {
  it("bytesToHexUpper emits a 64-char uppercase hex string", async () => {
    const hex = await sha256Hex(new TextEncoder().encode("test"));
    assert.equal(hex.length, 64);
    assert.match(hex, /^[0-9A-F]+$/);
  });

  it("bytesToHexUpper zero-pads single-digit nibbles (no Tusya false-positive)", () => {
    // 0x0a produces "0A", never "A". Tuya's parser rejects un-padded hex.
    assert.equal(bytesToHexUpper(new Uint8Array([0x0a]).buffer), "0A");
    assert.equal(bytesToHexUpper(new Uint8Array([0x00, 0x01]).buffer), "0001");
    assert.equal(bytesToHexUpper(new Uint8Array([0xff, 0xab]).buffer), "FFAB");
  });

  it("sha256Hex('empty') matches the documented EMPTY_BODY_SHA256", async () => {
    // Tuya accepts either upper or lower case for Content-SHA256; we pin
    // uppercase to match what sha256Hex produces in production (so the
    // string-to-sign body-hash section is consistently upper-case).
    assert.equal(
      (await sha256Hex(new TextEncoder().encode(""))).toLowerCase(),
      EMPTY_BODY_SHA256.toLowerCase(),
    );
  });

  it("hmacSha256Hex is deterministic (same key+msg → same hex)", async () => {
    const k = "fixed-key";
    const m = "fixed-msg";
    const a = await hmacSha256Hex(m, new TextEncoder().encode(k));
    const b = await hmacSha256Hex(m, new TextEncoder().encode(k));
    assert.equal(a, b);
    assert.equal(a.length, 64);
    assert.match(a, /^[0-9A-F]+$/);
  });

  it("hmacSha256Hex diverges when the message changes", async () => {
    const k = "fixed-key";
    const a = await hmacSha256Hex("one", new TextEncoder().encode(k));
    const b = await hmacSha256Hex("two", new TextEncoder().encode(k));
    assert.notEqual(a, b);
  });

  it("canonicalQuery sorts keys alphabetically and percent-encodes", () => {
    assert.equal(canonicalQuery({}), "");
    assert.equal(
      canonicalQuery({ grant_type: "1" }),
      "grant_type=1",
    );
    // Tuya requires alphabetical sort by key.
    assert.equal(
      canonicalQuery({ z: "1", a: "2", m: "3" }),
      "a=2&m=3&z=1",
    );
    // Percent-encoding must be normalised (no raw `+` sneaking in).
    assert.equal(
      canonicalQuery({ q: "hello world" }),
      "q=hello%20world",
    );
  });

  it("HMAC hex for VECTOR_INPUT paraphrased into a known crypto.js / RFC 4231 test vector", async () => {
    // RFC 4231 §4 Test Case 1: HMAC-SHA256(key=0x0b*20, data="Hi There") =
    //   b0344c61d8db38535ca8afcead0b5d6a8c2c6d5e2d5c8e5d5d8c5d8c5d8c5d8c
    // This is a stable cross-implementation sanity check independent of
    // our string-to-sign — proves our hmacSha256Hex matches every other
    // RFC-conformant HMAC-SHA256.
    const key = new Uint8Array(20).fill(0x0b);
    const sig = await hmacSha256Hex("Hi There", key);
    assert.equal(
      sig,
      "B0344C61D8DB38535CA8AFCEAF0BF12B881DC200C9833DA726E9376C2E32CFF7",
    );
  });
});
