/**
 * Firestore Document Service
 *
 * CRUD operations for managing documents within collections.
 */

import { getDb } from "./admin";
import { getDocumentsCollectionPath } from "./collections";
import type { Document, DocumentStatus } from "@/types";

/**
 * List documents in a collection with optional filtering and pagination.
 */
export interface ListDocumentsOptions {
  status?: DocumentStatus;
  limit?: number;
  offset?: number;
  orderBy?: "uploadedAt" | "processedAt" | "fileName";
  orderDirection?: "asc" | "desc";
}

export async function listDocuments(
  collectionId: string,
  options: ListDocumentsOptions = {}
): Promise<{ documents: Document[]; total: number }> {
  const db = getDb();
  const {
    status,
    limit = 50,
    offset = 0,
    orderBy = "uploadedAt",
    orderDirection = "desc",
  } = options;

  let query = db.collection(getDocumentsCollectionPath(collectionId));

  // Apply status filter
  if (status) {
    query = query.where("status", "==", status) as FirebaseFirestore.CollectionReference;
  }

  // Get total count (without pagination)
  const countSnapshot = await query.count().get();
  const total = countSnapshot.data().count;

  // Apply ordering and pagination
  let orderedQuery = query.orderBy(orderBy, orderDirection);
  if (offset > 0) {
    // For offset-based pagination, we need to use startAfter
    // This is a simplified approach - production would use cursors
    orderedQuery = orderedQuery.limit(offset + limit);
    const allDocs = await orderedQuery.get();
    const docs = allDocs.docs.slice(offset, offset + limit);
    return {
      documents: docs.map((doc) => ({ id: doc.id, ...doc.data() } as Document)),
      total,
    };
  }

  orderedQuery = orderedQuery.limit(limit);
  const snapshot = await orderedQuery.get();

  return {
    documents: snapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() } as Document)
    ),
    total,
  };
}

/**
 * Get a single document by ID.
 */
export async function getDocument(
  collectionId: string,
  documentId: string
): Promise<Document | null> {
  const db = getDb();
  const docRef = db.doc(`${getDocumentsCollectionPath(collectionId)}/${documentId}`);
  const snapshot = await docRef.get();

  if (!snapshot.exists) {
    return null;
  }

  return { id: snapshot.id, ...snapshot.data() } as Document;
}

/**
 * Create a new document record (after file upload).
 */
export interface CreateDocumentInput {
  collectionId: string;
  storagePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadedBy?: string;
}

export async function createDocument(
  input: CreateDocumentInput
): Promise<Document> {
  const db = getDb();
  const docsRef = db.collection(getDocumentsCollectionPath(input.collectionId));

  const now = new Date().toISOString();
  const docData: Omit<Document, "id"> = {
    collectionId: input.collectionId,
    storagePath: input.storagePath,
    fileName: input.fileName,
    fileSize: input.fileSize,
    mimeType: input.mimeType,
    status: "pending",
    uploadedAt: now,
  };

  // Only add uploadedBy if it's defined (Firestore doesn't accept undefined)
  if (input.uploadedBy) {
    docData.uploadedBy = input.uploadedBy;
  }

  const docRef = await docsRef.add(docData);

  return { id: docRef.id, ...docData };
}

/**
 * Update a document's status.
 */
export async function updateDocumentStatus(
  collectionId: string,
  documentId: string,
  status: DocumentStatus,
  error?: string
): Promise<void> {
  const db = getDb();
  const docRef = db.doc(`${getDocumentsCollectionPath(collectionId)}/${documentId}`);

  const updateData: Partial<Document> = { status };
  if (error) {
    updateData.error = error;
  }
  if (status === "ready") {
    updateData.processedAt = new Date().toISOString();
  }

  await docRef.update(updateData);
}

/**
 * Update a document's content/metadata.
 */
export async function updateDocumentContent(
  collectionId: string,
  documentId: string,
  content: Record<string, unknown>
): Promise<void> {
  const db = getDb();
  const docRef = db.doc(`${getDocumentsCollectionPath(collectionId)}/${documentId}`);

  await docRef.update({
    content,
    status: "metadata_ready",
    processedAt: new Date().toISOString(),
  });
}

/**
 * Delete a document.
 * Note: This does not delete the file from Cloud Storage.
 */
export async function deleteDocument(
  collectionId: string,
  documentId: string
): Promise<void> {
  const db = getDb();
  const docRef = db.doc(`${getDocumentsCollectionPath(collectionId)}/${documentId}`);
  await docRef.delete();
}

/**
 * Search documents by keywords (simple text search).
 * For vector similarity search, use the Cloud Function.
 */
export async function searchDocumentsByKeywords(
  collectionId: string,
  keywords: string[],
  limit: number = 20
): Promise<Document[]> {
  const db = getDb();
  const docsRef = db.collection(getDocumentsCollectionPath(collectionId));

  // Firestore array-contains-any for keyword matching
  // This is a simple approach - production would use vector search
  const query = docsRef
    .where("content.keywords", "array-contains-any", keywords)
    .where("status", "==", "ready")
    .limit(limit);

  const snapshot = await query.get();

  return snapshot.docs.map(
    (doc) => ({ id: doc.id, ...doc.data() } as Document)
  );
}

/**
 * Get documents pending processing.
 */
export async function getPendingDocuments(
  collectionId: string,
  limit: number = 10
): Promise<Document[]> {
  const db = getDb();
  const docsRef = db.collection(getDocumentsCollectionPath(collectionId));

  const query = docsRef
    .where("status", "==", "pending")
    .orderBy("uploadedAt", "asc")
    .limit(limit);

  const snapshot = await query.get();

  return snapshot.docs.map(
    (doc) => ({ id: doc.id, ...doc.data() } as Document)
  );
}

/**
 * Get recently processed documents.
 */
export async function getRecentDocuments(
  collectionId: string,
  limit: number = 10
): Promise<Document[]> {
  const db = getDb();
  const docsRef = db.collection(getDocumentsCollectionPath(collectionId));

  const query = docsRef
    .where("status", "==", "ready")
    .orderBy("processedAt", "desc")
    .limit(limit);

  const snapshot = await query.get();

  return snapshot.docs.map(
    (doc) => ({ id: doc.id, ...doc.data() } as Document)
  );
}
