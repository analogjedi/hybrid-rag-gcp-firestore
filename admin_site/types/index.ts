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

export interface ChapterMetadata {
  title: string;
  summary: string;
  pageStart?: number | null;
  pageEnd?: number | null;
  level: number;
  order: number;
}

// =============================================================================
// Extracted Element Types (Tables, Figures, Images)
// =============================================================================

export interface ExtractedTable {
  id: string;                    // "table_1"
  type: "table";
  title: string | null;          // Caption
  description: string;           // AI description
  pageNumber: number | null;
  order: number;
  columnHeaders: string[];
  rowCount: number | null;
  dataPreview: string;           // First few rows as text
}

export interface ExtractedFigure {
  id: string;                    // "figure_1"
  type: "figure";
  title: string | null;
  description: string;
  pageNumber: number | null;
  order: number;
  figureType: "chart" | "diagram" | "graph" | "schematic" | "other";
  visualElements: string[];      // ["bars", "legend", "axis labels"]
  dataInsights: string;          // Key takeaway
}

export interface ExtractedImage {
  id: string;                    // "image_1"
  type: "image";
  title: string | null;
  description: string;
  pageNumber: number | null;
  order: number;
  imageType: "photo" | "screenshot" | "logo" | "illustration" | "other";
  subjects: string[];            // What's depicted
  context: string;               // Document relevance
}

export type ExtractedElement = ExtractedTable | ExtractedFigure | ExtractedImage;

export interface ElementCounts {
  tables: number;
  figures: number;
  images: number;
}

export interface DocumentMetadata {
  summary: string;
  keywords: string[];
  chapters?: ChapterMetadata[];
  tables?: ExtractedTable[];
  figures?: ExtractedFigure[];
  images?: ExtractedImage[];
  elementCounts?: ElementCounts;
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
// Element Document Types (subcollection documents)
// =============================================================================

export type ElementStatus = "pending" | "ready" | "error";

export interface ElementDocument {
  id: string;                    // "table_1", "figure_2", etc.
  parentDocumentId: string;
  collectionId: string;
  elementType: "table" | "figure" | "image";
  element: ExtractedElement;
  parentFileName: string;        // Denormalized for display
  parentStoragePath: string;     // Denormalized for grounding
  contentEmbedding?: ContentEmbedding;
  status: ElementStatus;
  createdAt: string;
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
  matchType: "exact" | "semantic" | "element";  // How this result was matched
  summary: string;
  keywords: string[];
  fileName: string;
  storagePath: string;
  scoreBreakdown?: ScoreBreakdown;  // Present when debugMode is enabled
  // Rerank fields (present when reranking is applied)
  rerankPosition?: number;  // Position after reranking (0-indexed)
  originalPosition?: number;  // Original position before reranking
  rerankExplanation?: string | null;  // AI explanation for top results
  // Element-specific fields (present when matchType is "element")
  elementId?: string;            // e.g., "table_1", "figure_2"
  elementType?: "table" | "figure" | "image";
  elementTitle?: string | null;
  elementPageNumber?: number | null;
  parentDocumentId?: string;
}

export interface SearchMetadata {
  collectionsSearched: string[];
  totalCandidates: number;
  searchTimeMs: number;
  rerankApplied?: boolean;
}

export interface SearchResponse {
  results: SearchResult[];
  classification: ClassificationResult;
  searchMetadata: SearchMetadata;
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

// =============================================================================
// Chat Types
// =============================================================================

export interface ChatCitation {
  documentId: string;
  collectionId: string;
  fileName: string;
  summary: string;
  relevanceNote?: string;
  storagePath?: string;
  // Element-specific fields (present when citing an element)
  elementId?: string;            // e.g., "table_1", "figure_2"
  elementType?: "table" | "figure" | "image";
  elementTitle?: string | null;
  elementPageNumber?: number | null;
}

export interface ProcessLogStep {
  name: string;
  status: "pending" | "running" | "success" | "error";
  startTime?: string;
  endTime?: string;
  durationMs?: number;
  input?: unknown;
  output?: unknown;
  error?: string;
}

export interface ProcessLog {
  steps: ProcessLogStep[];
  totalDurationMs?: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: ChatCitation[];
  timestamp: string;
  isLoading?: boolean;
  processLog?: ProcessLog;
}

export interface GroundedAnswerRequest {
  query: string;
  documents: Array<{
    documentId: string;
    collectionId: string;
    fileName: string;
    summary: string;
    storagePath?: string;
  }>;
  conversationHistory?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
}

export interface GroundedAnswerResponse {
  answer: string;
  citations: ChatCitation[];
  confidence: number;
  tokensUsed?: number;
}
