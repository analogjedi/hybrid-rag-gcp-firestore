/**
 * Firestore Collection Service
 *
 * CRUD operations for managing document collections and their schemas.
 */

import { getDb, SYSTEM_COLLECTIONS } from "./admin";
import type { CollectionSchema, CollectionStats, Document } from "@/types";

/**
 * Get all collection schemas.
 */
export async function getAllCollections(): Promise<CollectionSchema[]> {
  const db = getDb();
  const schemasRef = db.collection(SYSTEM_COLLECTIONS.schemas);
  const snapshot = await schemasRef.get();

  return snapshot.docs.map((doc) => doc.data() as CollectionSchema);
}

/**
 * Get a single collection schema by ID.
 */
export async function getCollection(
  collectionId: string
): Promise<CollectionSchema | null> {
  const db = getDb();
  const docRef = db.doc(`${SYSTEM_COLLECTIONS.schemas}/${collectionId}`);
  const snapshot = await docRef.get();

  if (!snapshot.exists) {
    return null;
  }

  return snapshot.data() as CollectionSchema;
}

/**
 * Create or update a collection schema.
 */
export async function saveCollection(schema: CollectionSchema): Promise<void> {
  const db = getDb();
  const docRef = db.doc(`${SYSTEM_COLLECTIONS.schemas}/${schema.collection.id}`);
  await docRef.set(schema);
}

/**
 * Delete a collection schema.
 * Note: This does not delete the documents in the collection.
 */
export async function deleteCollection(collectionId: string): Promise<void> {
  const db = getDb();
  const docRef = db.doc(`${SYSTEM_COLLECTIONS.schemas}/${collectionId}`);
  await docRef.delete();
}

/**
 * Get the documents collection path for a given collection ID.
 * Documents are stored in: {collectionId}_documents
 */
export function getDocumentsCollectionPath(collectionId: string): string {
  return `${collectionId}_documents`;
}

/**
 * Get statistics for a collection.
 */
export async function getCollectionStats(
  collectionId: string
): Promise<CollectionStats> {
  const db = getDb();
  const docsRef = db.collection(getDocumentsCollectionPath(collectionId));

  // Get all documents to calculate stats
  const snapshot = await docsRef.get();
  const docs = snapshot.docs.map((doc) => doc.data() as Document);

  const stats: CollectionStats = {
    collectionId,
    totalDocuments: docs.length,
    withEmbedding: 0,
    withoutEmbedding: 0,
    processing: 0,
    errored: 0,
    coveragePercent: 0,
  };

  for (const doc of docs) {
    if (doc.status === "ready" && doc.contentEmbedding) {
      stats.withEmbedding++;
    } else if (doc.status === "error") {
      stats.errored++;
    } else if (
      doc.status === "pending" ||
      doc.status === "analyzing" ||
      doc.status === "metadata_ready" ||
      doc.status === "embedding"
    ) {
      stats.processing++;
    } else {
      stats.withoutEmbedding++;
    }
  }

  stats.coveragePercent =
    stats.totalDocuments > 0
      ? Math.round((stats.withEmbedding / stats.totalDocuments) * 100)
      : 0;

  return stats;
}

/**
 * Get statistics for all collections.
 */
export async function getAllCollectionStats(): Promise<CollectionStats[]> {
  const collections = await getAllCollections();
  const statsPromises = collections.map((c) =>
    getCollectionStats(c.collection.id)
  );
  return Promise.all(statsPromises);
}

/**
 * Initialize system collections if they don't exist.
 */
export async function initializeSystemCollections(): Promise<void> {
  const db = getDb();

  // Create the _system/config document if it doesn't exist
  const configRef = db.doc(SYSTEM_COLLECTIONS.config);
  const configSnap = await configRef.get();

  if (!configSnap.exists) {
    await configRef.set({
      initialized: true,
      createdAt: new Date().toISOString(),
    });
  }
}
