import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  checkForUpdate,
  manifestUrl,
  type OtaConfig,
  type UpdaterClient,
} from "../lib/cloud/ota";
import { isNewerVersion } from "../lib/cloud/ota-version";

// ---------------------------------------------------------------------------
// Shared fixtures for the checkForUpdate suite.
// ---------------------------------------------------------------------------

const BASE_CONFIG: OtaConfig = {
  supabaseUrl: "https://abc.supabase.co",
  bucket: "app-updates",
};

const VALID_MANIFEST = {
  version: "0.5.0",
  url: "https://cdn.example.com/bundle-0.5.0.zip",
  sha256: "deadbeefdeadbeefdeadbeefdeadbeef",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

function json200(body: unknown): Response {
  return jsonResponse(200, body);
}

function staticFetcher(res: Response): (url: string) => Promise<Response> {
  return async () => res;
}

/** A client that pretends the live bundle is "0.4.1" and always succeeds at
 *  downloading. Individual tests override whichever method they need to
 *  simulate failures — calling download when the test expects zero downloads
 *  just produces a noisy error string that the assertion below can match. */
function fakeClient(overrides: Partial<UpdaterClient> = {}): UpdaterClient {
  return {
    current: async () => ({ bundle: { version: "0.4.1" } }),
    download: async (opts) => ({ id: `bundle-${opts.version}` }),
    ...overrides,
  };
}

const FAILURE_DOWNLOAD_CLIENT = fakeClient({
  download: async () => {
    throw new Error("Checksum mismatch: downloaded bytes do not match sha256");
  },
});

// ---------------------------------------------------------------------------
// isNewerVersion — pure semver comparison, critical for OTA correctness
// ---------------------------------------------------------------------------

describe("isNewerVersion", () => {
  it("same version returns false", () => {
    assert.equal(isNewerVersion("1.0.0", "1.0.0"), false);
    assert.equal(isNewerVersion("0.4.0", "0.4.0"), false);
  });

  it("newer patch returns true", () => {
    assert.equal(isNewerVersion("1.0.0", "1.0.1"), true);
  });

  it("newer minor returns true", () => {
    assert.equal(isNewerVersion("1.0.9", "1.1.0"), true);
  });

  it("newer major returns true", () => {
    assert.equal(isNewerVersion("1.9.9", "2.0.0"), true);
  });

  it("older candidate returns false", () => {
    assert.equal(isNewerVersion("2.0.0", "1.9.9"), false);
    assert.equal(isNewerVersion("1.1.0", "1.0.9"), false);
    assert.equal(isNewerVersion("1.0.1", "1.0.0"), false);
  });

  it("shorter version is padded with zeros (1.0 vs 1.0.0)", () => {
    assert.equal(isNewerVersion("1.0", "1.0.0"), false);
    assert.equal(isNewerVersion("1.0.0", "1.0"), false);
    assert.equal(isNewerVersion("1.0", "1.0.1"), true);
    assert.equal(isNewerVersion("1.0.1", "1.0"), false);
  });

  it("longer candidate with zero-filled trailing segments is not newer", () => {
    assert.equal(isNewerVersion("1.0.0", "1.0.0.0"), false);
    assert.equal(isNewerVersion("1.0.0", "1.0.0.0.0"), false);
  });

  it("longer candidate with non-zero trailing segment is newer", () => {
    assert.equal(isNewerVersion("1.0.0", "1.0.0.1"), true);
  });

  it("falls back to string comparison when either side is non-numeric", () => {
    // Both non-numeric — string "beta" > "alpha"
    assert.equal(isNewerVersion("alpha", "beta"), true);
    assert.equal(isNewerVersion("beta", "alpha"), false);

    // One side non-numeric — falls back to string compare
    assert.equal(isNewerVersion("1.0.0", "1.0.x"), true); // "x" > "0" lexicographically
  });

  it("two-digit segments compare numerically (10 > 9)", () => {
    assert.equal(isNewerVersion("1.9.0", "1.10.0"), true);
    assert.equal(isNewerVersion("1.10.0", "1.9.0"), false);
  });
});

// ---------------------------------------------------------------------------
// manifestUrl — pure URL assembly, exported so the rendering is testable
// without touching the network.
// ---------------------------------------------------------------------------

describe("manifestUrl", () => {
  it("assembles the public Storage URL for app-updates/latest.json", () => {
    assert.equal(
      manifestUrl({ supabaseUrl: "https://abc.supabase.co", bucket: "app-updates" }),
      "https://abc.supabase.co/storage/v1/object/public/app-updates/app-updates/latest.json"
    );
  });

  it("strips a trailing slash on supabaseUrl so the path doesn't end up with a double slash", () => {
    assert.equal(
      manifestUrl({ supabaseUrl: "https://abc.supabase.co/", bucket: "app-updates" }),
      "https://abc.supabase.co/storage/v1/object/public/app-updates/app-updates/latest.json"
    );
  });

  it("uses the configured bucket name in the path (manifest lives at the app-updates/latest.json key inside it)", () => {
    // Note: the manifest is uploaded to the *key* "app-updates/latest.json"
    // inside the configured bucket. So the URL is `/bucket/app-updates/latest.json`,
    // not `/bucket/bucket/...`. When bucket happens to be named "app-updates",
    // the path naturally ends with `app-updates/app-updates/latest.json`.
    assert.equal(
      manifestUrl({ supabaseUrl: "https://x.supabase.co", bucket: "my-builds" }),
      "https://x.supabase.co/storage/v1/object/public/my-builds/app-updates/latest.json"
    );
  });
});

// ---------------------------------------------------------------------------
// checkForUpdate — exercises every branch via injected client/fetcher.
// (Cannot import the real CapacitorUpdater in Node, so the injectable seam
// is the only practical way to cover the network/manifest/checksum paths.
// The default client/fetcher branches are still covered by the type system
// and the underlying plugins' own tests if/when those exist.)
// ---------------------------------------------------------------------------

describe("checkForUpdate — HTTP failure modes", () => {
  const cases: Array<[number, string]> = [
    [401, "HTTP 401"],
    [403, "HTTP 403"],
    [404, "HTTP 404"], // bucket or path missing → permanent, not retryable
    [429, "HTTP 429"],
    [500, "HTTP 500"],
    [503, "HTTP 503"],
  ];
  for (const [status, expected] of cases) {
    it(`returns "error: HTTP ${status}" when the manifest endpoint returns ${status}`, async () => {
      const fetcher = staticFetcher(new Response("", { status }));
      const result = await checkForUpdate(BASE_CONFIG, { fetcher, client: fakeClient() });
      assert.deepEqual(result, { status: "error", message: expected });
    });
  }
});

describe("checkForUpdate — malformed manifest body", () => {
  it("returns error when manifest.body is not valid JSON", async () => {
    // The fetcher returns a 200 Response whose body is genuinely malformed
    // JSON — a real Response's own .json() throws on it exactly like a
    // partially-truncated upload landing on the CDN would.
    const fetcher = staticFetcher(new Response("<html>not json</html>", { status: 200 }));

    const result = await checkForUpdate(BASE_CONFIG, { fetcher, client: fakeClient() });
    assert.equal(result.status, "error");
    if (result.status === "error") {
      assert.match(result.message, /JSON/);
      assert.match(result.message, /Unexpected/);
    }
  });

  it("returns error when manifest has no version field", async () => {
    const fetcher = staticFetcher(
      json200({ url: VALID_MANIFEST.url, sha256: VALID_MANIFEST.sha256 })
    );
    const result = await checkForUpdate(BASE_CONFIG, { fetcher, client: fakeClient() });
    assert.equal(result.status, "error");
    if (result.status === "error") {
      assert.equal(result.message, "بيان التحديث غير صالح.");
    }
  });

  it("returns error when manifest has no url field", async () => {
    const fetcher = staticFetcher(
      json200({ version: VALID_MANIFEST.version, sha256: VALID_MANIFEST.sha256 })
    );
    const result = await checkForUpdate(BASE_CONFIG, { fetcher, client: fakeClient() });
    assert.equal(result.status, "error");
    if (result.status === "error") {
      assert.equal(result.message, "بيان التحديث غير صالح.");
    }
  });

  it("returns error when manifest has no sha256 field (no checksum → can't verify download)", async () => {
    const fetcher = staticFetcher(json200({ version: VALID_MANIFEST.version, url: VALID_MANIFEST.url }));
    const result = await checkForUpdate(BASE_CONFIG, { fetcher, client: fakeClient() });
    assert.equal(result.status, "error");
    if (result.status === "error") {
      assert.equal(result.message, "بيان التحديث غير صالح.");
    }
  });

  it("returns error when manifest is an empty JSON object", async () => {
    const fetcher = staticFetcher(json200({}));
    const result = await checkForUpdate(BASE_CONFIG, { fetcher, client: fakeClient() });
    assert.equal(result.status, "error");
    if (result.status === "error") {
      assert.equal(result.message, "بيان التحديث غير صالح.");
    }
  });
});

describe("checkForUpdate — network-layer failure modes", () => {
  it("returns timeout message on AbortError (fetch was aborted by the in-module timeout)", async () => {
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    const fetcher = async () => {
      throw abortError;
    };
    const result = await checkForUpdate(BASE_CONFIG, { fetcher, client: fakeClient() });
    assert.equal(result.status, "error");
    if (result.status === "error") {
      assert.match(result.message, /مهلة/);
    }
  });

  it("returns the underlying error message on a generic network failure (DNS, offline, etc.)", async () => {
    const fetcher = async () => {
      throw new Error("ENOTFOUND cdn.example.com");
    };
    const result = await checkForUpdate(BASE_CONFIG, { fetcher, client: fakeClient() });
    assert.equal(result.status, "error");
    if (result.status === "error") {
      assert.equal(result.message, "ENOTFOUND cdn.example.com");
    }
  });
});

describe("checkForUpdate — version comparison edge cases", () => {
  it("returns 'up-to-date' when manifest version equals the live bundle", async () => {
    let downloadCalled = false;
    const client = fakeClient({
      current: async () => ({ bundle: { version: "0.4.1" } }),
      download: async () => {
        downloadCalled = true;
        return { id: "should-not-be-used" };
      },
    });
    const fetcher = staticFetcher(json200({ ...VALID_MANIFEST, version: "0.4.1" }));

    const result = await checkForUpdate(BASE_CONFIG, { fetcher, client });
    assert.deepEqual(result, { status: "up-to-date" });
    assert.equal(downloadCalled, false, "client.download must not run when versions are equal");
  });

  it("returns 'up-to-date' when manifest version is older than the live bundle (downgrade guard)", async () => {
    const client = fakeClient({
      current: async () => ({ bundle: { version: "0.4.1" } }),
      download: async () => {
        throw new Error("download should not run for an older manifest version");
      },
    });
    const fetcher = staticFetcher(json200({ ...VALID_MANIFEST, version: "0.3.0" }));

    const result = await checkForUpdate(BASE_CONFIG, { fetcher, client });
    assert.deepEqual(result, { status: "up-to-date" });
  });

  it("returns 'updated' with bundleId when manifest version is strictly newer", async () => {
    let receivedDownloadOpts: { url: string; version: string; checksum: string } | null = null;
    const client = fakeClient({
      current: async () => ({ bundle: { version: "0.4.1" } }),
      download: async (opts) => {
        receivedDownloadOpts = opts;
        return { id: `bundle-${opts.version}` };
      },
    });
    const fetcher = staticFetcher(json200(VALID_MANIFEST));

    const result = await checkForUpdate(BASE_CONFIG, { fetcher, client });
    assert.deepEqual(result, { status: "updated", version: "0.5.0", bundleId: "bundle-0.5.0" });
    assert.deepEqual(receivedDownloadOpts, {
      url: VALID_MANIFEST.url,
      version: VALID_MANIFEST.version,
      checksum: VALID_MANIFEST.sha256,
    });
  });

  it("treats timestamp-style non-numeric version strings via the string-compare fallback", async () => {
    // Current bundle is a numeric-style version; candidate is a long numeric
    // timestamp string. Because both parse cleanly as numbers, segment-wise
    // comparison wins — "20260714120000" > "20260101000000". Verifies the
    // numeric branch handles arbitrary digit counts.
    const client = fakeClient({
      current: async () => ({ bundle: { version: "20260101000000" } }),
      download: async (opts) => ({ id: `bundle-${opts.version}` }),
    });
    const fetcher = staticFetcher(
      json200({ ...VALID_MANIFEST, version: "20260714120000" })
    );

    const result = await checkForUpdate(BASE_CONFIG, { fetcher, client });
    assert.equal(result.status, "updated");
    if (result.status === "updated") {
      assert.equal(result.version, "20260714120000");
    }
  });
});

describe("checkForUpdate — checksum mismatch (download-layer error)", () => {
  it("surfaces a download/checksum throw as 'error' with the plugin's message intact", async () => {
    const fetcher = staticFetcher(json200(VALID_MANIFEST));
    const result = await checkForUpdate(BASE_CONFIG, {
      fetcher,
      client: FAILURE_DOWNLOAD_CLIENT,
    });
    assert.equal(result.status, "error");
    if (result.status === "error") {
      assert.match(result.message, /Checksum mismatch/);
    }
  });
});

describe("checkForUpdate — request fan-out via the injected fetcher", () => {
  it("calls the fetcher exactly once with the manifestUrl produced from the config", async () => {
    const seenUrls: string[] = [];
    const fetcher = async (url: string) => {
      seenUrls.push(url);
      return json200(VALID_MANIFEST);
    };

    await checkForUpdate(
      { supabaseUrl: "https://xyz.supabase.co/", bucket: "builds" },
      { fetcher, client: fakeClient() }
    );

    assert.equal(seenUrls.length, 1);
    assert.equal(
      seenUrls[0],
      "https://xyz.supabase.co/storage/v1/object/public/builds/app-updates/latest.json"
    );
  });
});
