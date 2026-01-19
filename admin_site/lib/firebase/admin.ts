/**
 * Firebase Admin SDK Initialization
 *
 * This module initializes the Firebase Admin SDK for server-side operations.
 * It uses the GOOGLE_APPLICATION_CREDENTIALS environment variable for authentication.
 */

import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { getStorage, Storage } from "firebase-admin/storage";
import { readFileSync } from "fs";

let app: App;
let db: Firestore;
let storage: Storage;

function initializeFirebase(): App {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  // Check for service account credentials
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (credentialsPath) {
    // Use service account file - read and parse JSON
    const serviceAccountJson = readFileSync(credentialsPath, "utf-8");
    const serviceAccount = JSON.parse(serviceAccountJson);
    return initializeApp({
      credential: cert(serviceAccount),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });
  }

  // Fallback: Initialize without explicit credentials
  // This works in Google Cloud environments (Cloud Functions, Cloud Run, etc.)
  return initializeApp({
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });
}

/**
 * Get the Firebase Admin app instance.
 */
export function getApp(): App {
  if (!app) {
    app = initializeFirebase();
  }
  return app;
}

/**
 * Get the Firestore database instance.
 * Supports custom database IDs via FIRESTORE_DATABASE_ID env var.
 */
export function getDb(): Firestore {
  if (!db) {
    const application = getApp();
    const databaseId = process.env.FIRESTORE_DATABASE_ID;

    if (databaseId && databaseId !== "(default)") {
      // Use custom database ID
      db = getFirestore(application, databaseId);
    } else {
      // Use default database
      db = getFirestore(application);
    }
  }
  return db;
}

/**
 * Get the Cloud Storage instance.
 */
export function getStorageAdmin(): Storage {
  if (!storage) {
    getApp();
    storage = getStorage();
  }
  return storage;
}

/**
 * System collection paths for storing schemas and config.
 */
export const SYSTEM_COLLECTIONS = {
  schemas: "_system/config/schemas",
  config: "_system/config",
} as const;

/**
 * Get the Firestore path for a collection's documents.
 */
export function getCollectionPath(collectionId: string): string {
  return `${collectionId}/documents`;
}

/**
 * Get the Cloud Storage path for a document.
 */
export function getStoragePath(collectionId: string, fileName: string): string {
  const timestamp = Date.now();
  const sanitizedName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
  return `documents/${collectionId}/${timestamp}_${sanitizedName}`;
}
