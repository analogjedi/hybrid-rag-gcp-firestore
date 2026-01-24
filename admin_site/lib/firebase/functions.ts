/**
 * Cloud Functions Client
 *
 * Utilities for calling Cloud Functions from the server side.
 */

import { getApp } from "./admin";

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const FUNCTIONS_REGION = process.env.FUNCTIONS_REGION || "us-central1";

// Base URL for Cloud Functions v2
const getFunctionsUrl = (functionName: string) =>
  `https://${FUNCTIONS_REGION}-${PROJECT_ID}.cloudfunctions.net/${functionName}`;

/**
 * Call a Cloud Function using the callable protocol.
 * Note: This is for server-to-server calls without authentication.
 */
export async function callFunction<T = unknown>(
  functionName: string,
  data: Record<string, unknown>
): Promise<T> {
  const url = getFunctionsUrl(functionName);

  // Get a fresh ID token from the service account for server-to-server auth
  const { getAuth } = await import("firebase-admin/auth");
  const app = getApp();
  const auth = getAuth(app);

  // For server-to-server, we can use the service account
  // The callable protocol expects a specific format
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ data }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Function ${functionName} failed:`, errorText);
    throw new Error(`Cloud Function error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();

  // Callable functions return { result: ... } on success
  if (result.error) {
    throw new Error(result.error.message || "Function error");
  }

  return result.result as T;
}

/**
 * Process a single document (Gemini analysis).
 */
export async function processDocument(
  collectionId: string,
  documentId: string
): Promise<{
  success: boolean;
  metadata?: Record<string, unknown>;
  elementsCreated?: number;
  error?: string;
}> {
  return callFunction("process_document", { collectionId, documentId });
}

/**
 * Process all pending documents in a collection.
 */
export async function processPendingDocuments(
  collectionId: string,
  limit: number = 10
): Promise<{
  processed: number;
  errors: number;
  details: Array<{ documentId: string; success: boolean; error?: string }>;
}> {
  return callFunction("process_pending_documents", { collectionId, limit });
}

/**
 * Generate embedding for a single document.
 */
export async function generateDocumentEmbedding(
  collectionId: string,
  documentId: string
): Promise<{ success: boolean; skipped?: boolean; reason?: string; error?: string }> {
  return callFunction("generate_document_embedding", { collectionId, documentId });
}

/**
 * Generate embeddings for all documents in metadata_ready status.
 */
export async function generateEmbeddingsForReadyDocs(
  collectionId: string,
  limit: number = 50
): Promise<{
  processed: number;
  errors: number;
  details: Array<{ documentId: string; success: boolean; error?: string }>;
}> {
  return callFunction("generate_embeddings_for_ready_docs", { collectionId, limit });
}

/**
 * Backfill embeddings for documents missing them.
 */
export async function backfillEmbeddings(
  collectionId: string,
  limit: number = 50
): Promise<{ processed: number; errors: number }> {
  return callFunction("backfill_embeddings", { collectionId, limit });
}

/**
 * Classify and search across collections.
 */
export async function classifyAndSearch(
  query: string,
  limit: number = 10,
  threshold: number = 0.25,
  model: string = "gemini-2.5-pro",
  thinkingLevel: string = "LOW",
  debugMode: boolean = false,
  enableRerank: boolean = true
): Promise<{
  results: Array<{
    documentId: string;
    collectionId: string;
    rawSimilarity: number | null;
    weightedScore: number;
    matchType: "exact" | "semantic" | "element";
    summary: string;
    keywords: string[];
    fileName: string;
    storagePath: string;
    // Document structure for granular citations
    chapters?: Array<{
      title: string;
      summary: string;
      pageStart?: number | null;
      pageEnd?: number | null;
      level: number;
      order: number;
    }>;
    figures?: Array<{
      id: string;
      type: "figure";
      title: string | null;
      description: string;
      pageNumber: number | null;
      order: number;
      figureType: "chart" | "diagram" | "graph" | "schematic" | "other";
      visualElements: string[];
      dataInsights: string;
    }>;
    tables?: Array<{
      id: string;
      type: "table";
      title: string | null;
      description: string;
      pageNumber: number | null;
      order: number;
      columnHeaders: string[];
      rowCount: number | null;
      dataPreview: string;
    }>;
    scoreBreakdown?: {
      exactMatches: Array<{ term: string; matched: boolean }>;
      semanticScores: Array<{ term: string; similarity: number | null; score: number }>;
      fullQueryScore: { query: string; similarity: number | null; score: number } | null;
    };
    rerankPosition?: number;
    originalPosition?: number;
    rerankExplanation?: string | null;
    // Element-specific fields (present when matchType is "element")
    elementId?: string;
    elementType?: "table" | "figure" | "image";
    elementTitle?: string | null;
    elementPageNumber?: number | null;
    parentDocumentId?: string;
  }>;
  classification: {
    primary_collection: string;
    primary_confidence: number;
    secondary_collections: string[];
    secondary_confidence: number;
    reasoning: string;
    search_strategy: "primary_only" | "primary_then_secondary" | "parallel";
    exact_match_terms: string[];
    semantic_search_terms: string[];
  };
  searchMetadata: {
    collectionsSearched: string[];
    totalCandidates: number;
    searchTimeMs: number;
    rerankApplied?: boolean;
  };
}> {
  return callFunction("classify_and_search", { query, limit, threshold, model, thinkingLevel, debugMode, enableRerank });
}

/**
 * Get statistics for all collections.
 */
export async function getAllCollectionStats(): Promise<{
  stats: Array<{
    collectionId: string;
    totalDocuments: number;
    withEmbedding: number;
    withoutEmbedding: number;
    processing: number;
    errored: number;
    coveragePercent: number;
  }>;
}> {
  return callFunction("get_all_collection_stats", {});
}

/**
 * Create a vector index for a collection.
 * This should be called when a new collection is created.
 */
export async function createVectorIndex(
  collectionId: string
): Promise<{
  success: boolean;
  message: string;
  operationName: string | null;
}> {
  return callFunction("create_vector_index", { collectionId });
}

/**
 * Generate embeddings for elements in a document's subcollection.
 */
export async function generateElementEmbeddingsForDocument(
  collectionId: string,
  documentId: string
): Promise<{
  processed: number;
  errors: number;
  details: Array<{ elementId: string; success: boolean; error?: string }>;
}> {
  return callFunction("generate_element_embeddings_for_document", {
    collectionId,
    documentId,
  });
}

/**
 * Rebuild aggregated document keywords for a collection.
 * Scans all documents and rebuilds keyword frequency counts.
 */
export async function rebuildCollectionKeywords(
  collectionId: string
): Promise<{
  success: boolean;
  documentsScanned: number;
  uniqueKeywords: number;
  keywords: Record<string, number>;
}> {
  return callFunction("rebuild_collection_keywords", { collectionId });
}

/**
 * Generate a grounded answer based on retrieved documents.
 */
export async function generateGroundedAnswer(
  query: string,
  documents: Array<{
    documentId: string;
    collectionId: string;
    fileName: string;
    summary: string;
    keywords?: string[];
    storagePath?: string;
  }>,
  conversationHistory?: Array<{
    role: "user" | "assistant";
    content: string;
  }>
): Promise<{
  answer: string;
  citations: Array<{
    documentId: string;
    collectionId: string;
    fileName: string;
    summary: string;
    relevanceNote?: string;
    storagePath?: string;
  }>;
  confidence: number;
}> {
  return callFunction("generate_grounded_answer", {
    query,
    documents,
    conversationHistory,
  });
}
