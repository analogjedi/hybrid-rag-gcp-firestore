/**
 * Core Types for Document Search Admin
 */

// =============================================================================
// Schema Types
// =============================================================================

export interface SchemaField {
  name: string;
  type: "string" | "array" | "number" | "boolean";
  source: "gemini" | "manual";
  prompt?: string; // For gemini-sourced fields
  required?: boolean;
  description?: string;
  enum?: string[];
  default?: string | number | boolean;
  item_type?: string; // For array fields
  min_items?: number;
  max_items?: number;
}

export interface EmbeddingConfig {
  model: string;
  dimensions: number;
  source_fields: {
    field: string;
    weight: number;
    join?: string;
  }[];
  text_template: string;
}

export interface ClassifierHints {
  keywords: string[];
  example_queries: string[];
}

export interface CollectionSchema {
  collection: {
    id: string;
    display_name: string;
    description: string;
    icon: string;
  };
  fields: SchemaField[];
  embedding: EmbeddingConfig;
  classifier_hints: ClassifierHints;
}

// =============================================================================
// Document Types
// =============================================================================

export type DocumentStatus =
  | "pending"
  | "analyzing"
  | "metadata_ready"
  | "embedding"
  | "ready"
  | "error";

export interface ContentEmbedding {
  vector: number[];
  embeddedAt: string;
  modelVersion: string;
}

export interface DocumentMetadata {
  summary: string;
  keywords: string[];
  [key: string]: unknown; // Schema-defined fields
}

export interface Document {
  id: string;
  collectionId: string;
  storagePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  status: DocumentStatus;
  content?: DocumentMetadata;
  contentEmbedding?: ContentEmbedding;
  uploadedAt: string;
  uploadedBy?: string;
  processedAt?: string;
  error?: string;
}

// =============================================================================
// Search Types
// =============================================================================

export interface ClassificationResult {
  primary_collection: string;
  primary_confidence: number;
  secondary_collections: string[];
  secondary_confidence: number;
  reasoning: string;
  search_strategy: "primary_only" | "primary_then_secondary" | "parallel";
}

export interface SearchResult {
  documentId: string;
  collectionId: string;
  rawDistance: number;
  weightedScore: number;
  summary: string;
  keywords: string[];
  fileName: string;
  storagePath: string;
}

export interface SearchResponse {
  results: SearchResult[];
  classification: ClassificationResult;
  searchMetadata: {
    collectionsSearched: string[];
    totalCandidates: number;
    searchTimeMs: number;
  };
}

// =============================================================================
// Collection Stats
// =============================================================================

export interface CollectionStats {
  collectionId: string;
  totalDocuments: number;
  withEmbedding: number;
  withoutEmbedding: number;
  processing: number;
  errored: number;
  coveragePercent: number;
}
