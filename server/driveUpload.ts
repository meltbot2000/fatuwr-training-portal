/**
 * Google Drive image storage.
 *
 * All photos (profile, announcements, merch) are stored as files in a shared
 * Drive folder. The DB column stores only the public URL (~60 bytes) instead
 * of a base64 data URL (~150 KB+), making DB rows ~1000× smaller and removing
 * Railway bandwidth from every image load.
 *
 * Images are served via lh3.googleusercontent.com/d/<fileId> — a direct
 * Google-served URL that works as an <img src> without any sign-in.
 *
 * Upload latency: ~300–800 ms added to the save mutation (upload only, not reads).
 * Read latency: faster than before — DB rows are tiny and images load client-side
 * from Google's network, bypassing Railway entirely.
 */

import { google } from "googleapis";
import { Readable } from "stream";
import { ENV } from "./_core/env";

// ─── Auth ─────────────────────────────────────────────────────────────────────

function getDrive() {
  if (!ENV.googleServiceAccountJson) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set");
  if (!ENV.googleDriveFolderId)       throw new Error("GOOGLE_DRIVE_FOLDER_ID is not set");

  let creds: object;
  try {
    creds = JSON.parse(ENV.googleServiceAccountJson);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON");
  }

  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });

  return google.drive({ version: "v3", auth });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true if the value is a base64 data URL (needs uploading). */
export function isDataUrl(value: string): boolean {
  return value.startsWith("data:");
}

/** Returns true if the value is already a Drive URL (already uploaded). */
export function isDriveUrl(value: string): boolean {
  return value.includes("lh3.googleusercontent.com") || value.includes("drive.google.com");
}

/**
 * Extract the Drive file ID from a Drive serving URL.
 * Handles: https://lh3.googleusercontent.com/d/<id>
 *          https://drive.google.com/file/d/<id>/view
 */
export function extractDriveFileId(url: string): string | null {
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

// ─── Core operations ──────────────────────────────────────────────────────────

/**
 * Upload a base64 data URL to Drive and return the public serving URL.
 * The file is placed in GOOGLE_DRIVE_FOLDER_ID and made publicly readable.
 */
export async function uploadToDrive(
  base64DataUrl: string,
  filename: string,
): Promise<string> {
  const match = base64DataUrl.match(/^data:([^;]+);base64,([\s\S]+)$/);
  if (!match) throw new Error("Invalid data URL format");
  const [, mimeType, base64Data] = match;

  const buffer  = Buffer.from(base64Data, "base64");
  const drive   = getDrive();

  const createRes = await drive.files.create({
    requestBody: {
      name:    filename,
      parents: [ENV.googleDriveFolderId],
    },
    media: {
      mimeType,
      body: Readable.from(buffer),
    },
    fields: "id",
  });

  const fileId = createRes.data.id;
  if (!fileId) throw new Error("Drive upload returned no file ID");

  // Make the file publicly readable (anyone with the link)
  await drive.permissions.create({
    fileId,
    requestBody: { role: "reader", type: "anyone" },
  });

  return `https://lh3.googleusercontent.com/d/${fileId}`;
}

/**
 * Delete a Drive file by its file ID.
 * Silently swallows errors (orphaned files are acceptable vs crashing a delete flow).
 */
export async function deleteFromDrive(fileId: string): Promise<void> {
  try {
    const drive = getDrive();
    await drive.files.delete({ fileId });
    console.log(`[Drive] Deleted file ${fileId}`);
  } catch (e: any) {
    console.warn(`[Drive] Could not delete file ${fileId}:`, e?.message);
  }
}

/**
 * If the old value was a Drive URL, delete the old file.
 * Call this before overwriting a photo column with a new URL.
 */
export async function replaceOldDriveFile(oldValue: string | null | undefined): Promise<void> {
  if (!oldValue) return;
  if (!isDriveUrl(oldValue)) return; // was base64 or empty — nothing to delete
  const fileId = extractDriveFileId(oldValue);
  if (fileId) await deleteFromDrive(fileId);
}

/**
 * Upload if the value is a base64 data URL; return as-is if it's already a URL.
 * filename is used only for the Drive file name (cosmetic).
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
