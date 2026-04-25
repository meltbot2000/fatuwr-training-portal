/**
 * Cloudflare R2 image storage.
 *
 * All photos (profile, announcements, merch) are stored in an R2 bucket.
 * The DB column stores only the public URL (~80 bytes) instead of a base64
 * data URL (~150 KB+), making DB rows ~1000× smaller and removing Railway
 * bandwidth from every image load.
 *
 * Images are served via the R2 public bucket URL configured in CLOUDFLARE_R2_PUBLIC_URL.
 *
 * Upload latency: ~200–600 ms added to the save mutation (upload only, not reads).
 * Read latency: faster than before — DB rows are tiny and images load client-side
 * from Cloudflare's network, bypassing Railway entirely.
 *
 * NOTE: Function names retain "Drive" prefixes for backwards-compatibility with
 * callers in routers.ts. Internally they operate on R2.
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import { ENV } from "./_core/env";

// ─── Client ───────────────────────────────────────────────────────────────────

function getR2(): S3Client {
  if (!ENV.r2AccountId)      throw new Error("CLOUDFLARE_R2_ACCOUNT_ID is not set");
  if (!ENV.r2AccessKeyId)    throw new Error("CLOUDFLARE_R2_ACCESS_KEY_ID is not set");
  if (!ENV.r2SecretAccessKey) throw new Error("CLOUDFLARE_R2_SECRET_ACCESS_KEY is not set");
  if (!ENV.r2Bucket)         throw new Error("CLOUDFLARE_R2_BUCKET is not set");
  if (!ENV.r2PublicUrl)      throw new Error("CLOUDFLARE_R2_PUBLIC_URL is not set");

  return new S3Client({
    region: "auto",
    endpoint: `https://${ENV.r2AccountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: ENV.r2AccessKeyId,
      secretAccessKey: ENV.r2SecretAccessKey,
    },
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true if the value is a base64 data URL (needs uploading). */
export function isDataUrl(value: string): boolean {
  return value.startsWith("data:");
}

/** Returns true if the value is already a hosted URL (already uploaded). */
export function isDriveUrl(value: string): boolean {
  // Matches R2 public URLs, legacy Google Drive / lh3 URLs, and any other https URL
  return (
    value.startsWith("https://") ||
    value.startsWith("http://") ||
    value.includes("lh3.googleusercontent.com") ||
    value.includes("drive.google.com")
  );
}

/**
 * Extract the R2 object key from an R2 public URL.
 * Returns null for non-R2 URLs (e.g. legacy Drive URLs).
 */
export function extractDriveFileId(url: string): string | null {
  if (!ENV.r2PublicUrl) return null;
  const base = ENV.r2PublicUrl.replace(/\/$/, "");
  if (url.startsWith(base + "/")) {
    return url.slice(base.length + 1); // the object key
  }
  // Legacy: extract Drive file ID from lh3 / drive URLs
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

// ─── Core operations ──────────────────────────────────────────────────────────

/**
 * Upload a base64 data URL to R2 and return the public URL.
 */
export async function uploadToDrive(
  base64DataUrl: string,
  filename: string,
): Promise<string> {
  const match = base64DataUrl.match(/^data:([^;]+);base64,([\s\S]+)$/);
  if (!match) throw new Error("Invalid data URL format");
  const [, mimeType, base64Data] = match;

  const buffer = Buffer.from(base64Data, "base64");
  const r2 = getR2();

  // Use a UUID key with the original filename as a suffix for uniqueness
  const ext = mimeType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
  const key = `photos/${randomUUID()}-${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  await r2.send(new PutObjectCommand({
    Bucket: ENV.r2Bucket,
    Key: key,
    Body: buffer,
    ContentType: mimeType,
  }));

  const base = ENV.r2PublicUrl.replace(/\/$/, "");
  return `${base}/${key}`;
}

/**
 * Upload a raw Buffer (with known MIME type) to R2 and return the public URL.
 * Used by the Glide migration which already has the buffer from fetch().
 */
export async function uploadBufferToR2(
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<string> {
  const r2 = getR2();
  const key = `photos/${randomUUID()}-${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  await r2.send(new PutObjectCommand({
    Bucket: ENV.r2Bucket,
    Key: key,
    Body: buffer,
    ContentType: mimeType,
  }));

  const base = ENV.r2PublicUrl.replace(/\/$/, "");
  return `${base}/${key}`;
}

/**
 * Delete an R2 object by its key (or a legacy Drive file ID — silently skipped).
 * Silently swallows errors to avoid crashing delete flows.
 */
export async function deleteFromDrive(fileIdOrKey: string): Promise<void> {
  // Legacy Drive file IDs (short alphanumeric) can't be deleted via R2 — skip
  if (!ENV.r2PublicUrl || !fileIdOrKey.includes("/")) {
    console.log(`[R2] Skipping delete for legacy/unknown key: ${fileIdOrKey}`);
    return;
  }
  try {
    const r2 = getR2();
    await r2.send(new DeleteObjectCommand({
      Bucket: ENV.r2Bucket,
      Key: fileIdOrKey,
    }));
    console.log(`[R2] Deleted object ${fileIdOrKey}`);
  } catch (e: any) {
    console.warn(`[R2] Could not delete object ${fileIdOrKey}:`, e?.message);
  }
}

/**
 * If the old value was a hosted URL, delete the old object from R2.
 * Call this before overwriting a photo column with a new URL.
 */
export async function replaceOldDriveFile(oldValue: string | null | undefined): Promise<void> {
  if (!oldValue) return;
  if (!isDriveUrl(oldValue)) return; // was base64 or empty — nothing to delete
  const key = extractDriveFileId(oldValue);
  if (key) await deleteFromDrive(key);
}

/**
 * Upload if the value is a base64 data URL; return as-is if it's already a URL.
 * filename is used only as a cosmetic hint in the R2 key.
 * Returns null/undefined passthrough for empty values.
 */
export async function maybeUpload(
  value: string | null | undefined,
  filename: string,
): Promise<string | null> {
  if (!value) return null;
  if (isDataUrl(value)) return uploadToDrive(value, filename);
  return value; // already a URL — return unchanged
}
