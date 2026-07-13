/**
 * Client-side image resize helper for product photos.
 *
 * The app stores product images as base64 data URLs in the in-memory
 * sql.js DB. To keep that DB small (and the IndexedDB round-trip quick)
 * we cap the longest side at ~256px and emit a JPEG @ quality 0.7.
 *
 * The expected output is a typical 5–25 KB string — well within an
 * IndexedDB value budget. We never persist the original File or a
 * multi-MB PNG: the canvas redraw is the only thing that survives.
 *
 * Browser-only. Never import this from a server module:
 *   `FileReader`, `Image`, `canvas` are runtime globals of the user agent.
 */
export interface ResizeImageOptions {
  /** Longest-side cap, in CSS pixels. Default 256 — fine for a 64×64 thumbnail. */
  maxSidePx?: number;
  /** JPEG encoder quality, 0..1. Default 0.7. */
  quality?: number;
  /** Hard cap on output bytes; warns (and throws) when exceeded. Default 40 KB. */
  maxBytes?: number;
}

const DEFAULT_MAX_SIDE = 256;
const DEFAULT_QUALITY = 0.7;
const DEFAULT_MAX_BYTES = 40 * 1024;

/**
 * Reads the given File → decodes it → resizes onto a canvas so the
 * longest side ≤ `maxSidePx` → re-encodes as JPEG @ `quality`. Returns
 * a `data:image/jpeg;base64,...` string suitable for storing in
 * `Product.imageDataUrl`.
 */
export async function resizeImageFileToJpegDataUrl(
  file: File,
  opts: ResizeImageOptions = {},
): Promise<string> {
  const maxSidePx = opts.maxSidePx ?? DEFAULT_MAX_SIDE;
  const quality = opts.quality ?? DEFAULT_QUALITY;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;

  const dataUrl = await readAsDataUrl(file);
  const decoded = await loadImage(dataUrl);

  const longest = Math.max(decoded.width, decoded.height);
  const scale = Math.min(1, maxSidePx / Math.max(1, longest));
  const w = Math.max(1, Math.round(decoded.width * scale));
  const h = Math.max(1, Math.round(decoded.height * scale));

  const canvas =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(w, h)
      : (() => {
          const c = document.createElement("canvas");
          c.width = w;
          c.height = h;
          return c;
        })();
  const ctx = ensure2d(canvas);
  ctx.drawImage(decoded, 0, 0, w, h);

  let output: string;
  if ("convertToBlob" in canvas && typeof canvas.convertToBlob === "function") {
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
    output = await blobToDataUrl(blob);
  } else {
    // toDataURL exists on HTMLCanvasElement; OffscreenCanvas exposes
    // convertToBlob above, which is preferred when available.
    output = (canvas as HTMLCanvasElement).toDataURL("image/jpeg", quality);
  }

  // Rough sanity check: data URL length × 3/4 ≈ decoded bytes.
  const approxBytes = Math.floor(output.length * 0.75);
  if (approxBytes > maxBytes) {
    throw new Error(
      `الصورة بعد التصغير لا تزال كبيرة (${(approxBytes / 1024).toFixed(1)} KB)`,
    );
  }

  return output;
}

/* ------------------------- helpers ------------------------- */

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error("image decode failed"));
    img.onload = () => resolve(img);
    img.src = src;
  });
}

function ensure2d(canvas: HTMLCanvasElement | OffscreenCanvas): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  return ctx as CanvasRenderingContext2D;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}
