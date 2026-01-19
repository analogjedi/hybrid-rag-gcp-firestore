/**
 * Cloud Storage Service
 *
 * File upload and management for documents.
 */

import { getStorageAdmin, getStoragePath } from "./admin";

/**
 * Upload a file to Cloud Storage.
 * Returns the storage path (gs:// URI).
 */
export async function uploadFile(
  collectionId: string,
  fileName: string,
  fileBuffer: Buffer,
  mimeType: string
): Promise<{ storagePath: string; publicUrl: string }> {
  const storage = getStorageAdmin();
  const bucket = storage.bucket();

  const storagePath = getStoragePath(collectionId, fileName);
  const file = bucket.file(storagePath);

  await file.save(fileBuffer, {
    metadata: {
      contentType: mimeType,
    },
  });

  // Get the gs:// URI for Gemini
  const gsUri = `gs://${bucket.name}/${storagePath}`;

  // Generate a public URL (if bucket is public) or signed URL
  const [signedUrl] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  return {
    storagePath: gsUri,
    publicUrl: signedUrl,
  };
}

/**
 * Delete a file from Cloud Storage.
 */
export async function deleteFile(storagePath: string): Promise<void> {
  const storage = getStorageAdmin();
  const bucket = storage.bucket();

  // Extract the path from gs:// URI
  const pathMatch = storagePath.match(/^gs:\/\/[^/]+\/(.+)$/);
  if (!pathMatch) {
    throw new Error(`Invalid storage path: ${storagePath}`);
  }

  const filePath = pathMatch[1];
  const file = bucket.file(filePath);

  await file.delete();
}

/**
 * Get a signed URL for downloading a file.
 */
export async function getDownloadUrl(
  storagePath: string,
  expiresInMs: number = 60 * 60 * 1000 // 1 hour default
): Promise<string> {
  const storage = getStorageAdmin();
  const bucket = storage.bucket();

  // Extract the path from gs:// URI
  const pathMatch = storagePath.match(/^gs:\/\/[^/]+\/(.+)$/);
  if (!pathMatch) {
    throw new Error(`Invalid storage path: ${storagePath}`);
  }

  const filePath = pathMatch[1];
  const file = bucket.file(filePath);

  const [signedUrl] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + expiresInMs,
  });

  return signedUrl;
}

/**
 * Check if a file exists in Cloud Storage.
 */
export async function fileExists(storagePath: string): Promise<boolean> {
  const storage = getStorageAdmin();
  const bucket = storage.bucket();

  // Extract the path from gs:// URI
  const pathMatch = storagePath.match(/^gs:\/\/[^/]+\/(.+)$/);
  if (!pathMatch) {
    return false;
  }

  const filePath = pathMatch[1];
  const file = bucket.file(filePath);

  const [exists] = await file.exists();
  return exists;
}

/**
 * Get file metadata from Cloud Storage.
 */
export interface FileMetadata {
  name: string;
  size: number;
  contentType: string;
  created: string;
  updated: string;
}

export async function getFileMetadata(
  storagePath: string
): Promise<FileMetadata | null> {
  const storage = getStorageAdmin();
  const bucket = storage.bucket();

  // Extract the path from gs:// URI
  const pathMatch = storagePath.match(/^gs:\/\/[^/]+\/(.+)$/);
  if (!pathMatch) {
    return null;
  }

  const filePath = pathMatch[1];
  const file = bucket.file(filePath);

  try {
    const [metadata] = await file.getMetadata();
    return {
      name: metadata.name || filePath,
      size: Number(metadata.size) || 0,
      contentType: metadata.contentType || "application/octet-stream",
      created: metadata.timeCreated || "",
      updated: metadata.updated || "",
    };
  } catch (error) {
    return null;
  }
}
