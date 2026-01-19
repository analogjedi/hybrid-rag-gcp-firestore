/**
 * Firestore Vector Search Client
 *
 * This module provides TypeScript wrappers for the vector search
 * Cloud Functions, including a React hook for debounced searching.
 *
 * @example
 * ```typescript
 * // Direct function call
 * const results = await searchDocuments({
 *   query: "FinFET process",
 *   limit: 20,
 *   threshold: 0.5
 * });
 *
 * // React hook
 * const { results, isSearching } = useVectorSearch("FinFET process", 0.5);
 * ```
 */

import { getFunctions, httpsCallable, HttpsCallableResult } from 'firebase/functions';
import type {
  SearchRequest,
  SearchResponse,
  SearchResult,
  BackfillRequest,
  BackfillResponse,
  EmbeddingStats,
  FunctionsError,
  isFunctionsError,
} from './types';

// Re-export types for convenience
export type { SearchRequest, SearchResponse, SearchResult, BackfillRequest, BackfillResponse };

// =============================================================================
// Firebase Functions Wrappers
// =============================================================================

/**
 * Search documents using natural language query.
 *
 * Uses vector similarity search to find semantically matching documents.
 *
 * @param request - Search parameters
 * @returns Search results with relevance scores
 * @throws FunctionsError for authentication or validation errors
 *
 * @example
 * ```typescript
 * const response = await searchDocuments({
 *   query: "yield improvement techniques",
 *   limit: 20,
 *   threshold: 0.5
 * });
 *
 * response.results.forEach(result => {
 *   console.log(`${result.relevanceScore}% - ${result.summary}`);
 * });
 * ```
 */
export async function searchDocuments(request: SearchRequest): Promise<SearchResponse> {
  const functions = getFunctions();
  const searchFn = httpsCallable<SearchRequest, SearchResponse>(
    functions,
    'vector_search',
    { timeout: 30000 } // 30 seconds
  );

  const result: HttpsCallableResult<SearchResponse> = await searchFn(request);
  return result.data;
}

/**
 * Backfill embeddings for existing documents.
 *
 * Processes documents that don't have embeddings or have outdated embeddings.
 * Call repeatedly until `remaining` is 0.
 *
 * @param request - Backfill parameters
 * @returns Processing results with counts
 *
 * @example
 * ```typescript
 * // Process in batches until complete
 * let remaining = 1;
 * while (remaining > 0) {
 *   const response = await backfillEmbeddings({ limit: 50 });
 *   console.log(`Processed ${response.processed}, ${response.remaining} remaining`);
 *   remaining = response.remaining;
 * }
 * ```
 */
export async function backfillEmbeddings(request: BackfillRequest = {}): Promise<BackfillResponse> {
  const functions = getFunctions();
  const backfillFn = httpsCallable<BackfillRequest, BackfillResponse>(
    functions,
    'backfill_embeddings',
    { timeout: 540000 } // 9 minutes
  );

  const result = await backfillFn(request);
  return result.data;
}

/**
 * Get embedding coverage statistics.
 *
 * @param collectionPath - Path to the collection to analyze
 * @returns Statistics about embedding coverage
 */
export async function getEmbeddingStats(collectionPath: string = 'documents'): Promise<EmbeddingStats> {
  const functions = getFunctions();
  const statsFn = httpsCallable<{ collectionPath: string }, EmbeddingStats>(
    functions,
    'get_embedding_stats',
    { timeout: 60000 }
  );

  const result = await statsFn({ collectionPath });
  return result.data;
}

// =============================================================================
// React Hook for Debounced Search
// =============================================================================

/**
 * Options for the useVectorSearch hook.
 */
export interface UseVectorSearchOptions {
  /** Debounce delay in milliseconds (default: 500) */
  debounceMs?: number;

  /** Minimum query length to trigger search (default: 3) */
  minQueryLength?: number;

  /** Maximum results to return (default: 20) */
  limit?: number;

  /** Collection to search (default: "documents") */
  collectionPath?: string;
}

/**
 * Return type for useVectorSearch hook.
 */
export interface UseVectorSearchResult {
  /** Search results, null if no search performed */
  results: SearchResult[] | null;

  /** Whether a search is in progress */
  isSearching: boolean;

  /** Error message if search failed */
  error: string | null;

  /** Map of document ID to relevance data for quick lookup */
  resultMap: Map<string, { relevanceScore: number; distance: number }>;
}

/**
 * React hook for debounced vector search.
 *
 * Automatically debounces search queries and manages loading state.
 * Results are cached and only updated when the search completes.
 *
 * @param query - Search query string
 * @param threshold - Distance threshold (0.0-1.0)
 * @param options - Additional options
 * @returns Search results and state
 *
 * @example
 * ```tsx
 * function SearchComponent() {
 *   const [query, setQuery] = useState('');
 *   const [threshold, setThreshold] = useState(0.5);
 *
 *   const { results, isSearching, error } = useVectorSearch(query, threshold);
 *
 *   return (
 *     <div>
 *       <input
 *         value={query}
 *         onChange={(e) => setQuery(e.target.value)}
 *         placeholder="Search documents..."
 *       />
 *       {isSearching && <Spinner />}
 *       {error && <ErrorMessage>{error}</ErrorMessage>}
 *       {results?.map(r => (
 *         <ResultCard key={r.documentId} result={r} />
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function useVectorSearch(
  query: string,
  threshold: number,
  options: UseVectorSearchOptions = {}
): UseVectorSearchResult {
  // This is a placeholder implementation showing the pattern.
  // In a real app, you'd use React's useState, useEffect, useMemo.

  const {
    debounceMs = 500,
    minQueryLength = 3,
    limit = 20,
    collectionPath = 'documents',
  } = options;

  // Example React implementation (requires React imports):
  /*
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!query.trim() || query.trim().length < minQueryLength) {
      setResults(null);
      setError(null);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      setError(null);

      try {
        const response = await searchDocuments({
          query,
          limit,
          threshold,
          collectionPath,
        });
        setResults(response.results);
      } catch (err) {
        console.error('Search error:', err);
        setError(err instanceof Error ? err.message : 'Search failed');
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, debounceMs);

    return () => clearTimeout(timeoutId);
  }, [query, threshold, limit, collectionPath, debounceMs, minQueryLength]);

  const resultMap = useMemo(() => {
    if (!results) return new Map();
    return new Map(
      results.map(r => [r.documentId, { relevanceScore: r.relevanceScore, distance: r.distance }])
    );
  }, [results]);

  return { results, isSearching, error, resultMap };
  */

  // Placeholder return for documentation purposes
  return {
    results: null,
    isSearching: false,
    error: null,
    resultMap: new Map(),
  };
}

// =============================================================================
// Threshold Persistence
// =============================================================================

const THRESHOLD_STORAGE_KEY = 'vector_search_threshold';

/**
 * Load saved search threshold from localStorage.
 *
 * @param defaultValue - Default threshold if none saved
 * @returns Saved threshold or default
 */
export function loadSearchThreshold(defaultValue: number = 0.5): number {
  if (typeof window === 'undefined') return defaultValue;

  try {
    const saved = localStorage.getItem(THRESHOLD_STORAGE_KEY);
    if (saved) {
      const parsed = parseFloat(saved);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
        return parsed;
      }
    }
  } catch {
    // localStorage not available
  }

  return defaultValue;
}

/**
 * Save search threshold to localStorage.
 *
 * @param threshold - Threshold value to save (0.0-1.0)
 */
export function saveSearchThreshold(threshold: number): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(THRESHOLD_STORAGE_KEY, threshold.toString());
  } catch {
    // localStorage not available
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Format relevance score for display.
 *
 * @param score - Relevance score (0-100)
 * @param distance - Raw cosine distance
 * @returns Formatted string like "75% (d=0.125)"
 */
export function formatRelevance(score: number, distance: number): string {
  return `${score}% (d=${distance.toFixed(3)})`;
}

/**
 * Check if a document matches search results.
 *
 * @param documentId - Document ID to check
 * @param resultMap - Map from useVectorSearch
 * @returns True if document is in search results
 */
export function isInSearchResults(
  documentId: string,
  resultMap: Map<string, { relevanceScore: number; distance: number }>
): boolean {
  return resultMap.has(documentId);
}

/**
 * Get relevance info for a document from search results.
 *
 * @param documentId - Document ID to look up
 * @param resultMap - Map from useVectorSearch
 * @returns Relevance info or undefined if not in results
 */
export function getRelevanceInfo(
  documentId: string,
  resultMap: Map<string, { relevanceScore: number; distance: number }>
): { relevanceScore: number; distance: number } | undefined {
  return resultMap.get(documentId);
}
