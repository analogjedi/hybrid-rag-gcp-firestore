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
  exact_match_terms: string[];  // Terms for keyword matching (part numbers, identifiers)
  semantic_search_terms: string[];  // Terms for semantic/concept matching
}

// =============================================================================
// Score Breakdown Types (Debug Mode)
// =============================================================================

export interface ExactMatchScore {
  term: string;
  matched: boolean;
}

export interface SemanticScore {
  term: string;
  similarity: number | null;
  score: number;
}

export interface FullQueryScore {
  query: string;
  similarity: number | null;
  score: number;
}

export interface ScoreBreakdown {
  exactMatches: ExactMatchScore[];
  semanticScores: SemanticScore[];
  fullQueryScore: FullQueryScore | null;
}

export interface SearchResult {
  documentId: string;
  collectionId: string;
  rawSimilarity: number | null;  // DOT_PRODUCT similarity (-1 to 1, higher = more similar), null for exact matches
  weightedScore: number;  // Normalized score (0 to 1)
  matchType: "exact" | "semantic";  // How this result was matched
  summary: string;
  keywords: string[];
  fileName: string;
  storagePath: string;
  scoreBreakdown?: ScoreBreakdown;  // Present when debugMode is enabled
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
