# Relevance Scoring

This document explains how DOT_PRODUCT similarity is converted to human-readable relevance percentages.

## The Problem

Firestore's `find_nearest()` with DOT_PRODUCT returns a **similarity score**:
- `1.0` = Identical vectors (perfect match)
- `0.0` = Orthogonal vectors (unrelated)
- `-1.0` = Completely opposite vectors

But users don't think in terms of "dot product 0.72" - they think in terms of "75% relevant."

## The Solution

Convert DOT_PRODUCT similarity to a percentage:

```python
# DOT_PRODUCT returns similarity directly (-1 to 1 for normalized vectors)
# Normalize to 0-100% range
relevance_score = max(0, min(100, int((similarity + 1) / 2 * 100)))
```

For search results, we typically only care about positive similarity:

```python
# Simpler: treat 0-1 range as 0-100%
relevance_score = max(0, min(100, int(similarity * 100)))
```

## Why DOT_PRODUCT?

With `gemini-embedding-001`, vectors are normalized (unit length), so:
- DOT_PRODUCT = COSINE similarity (mathematically equivalent for unit vectors)
- Higher values = more similar (intuitive)
- Computationally more efficient than COSINE distance

## Conversion Table

| DOT_PRODUCT | Relevance Score | Interpretation |
|-------------|-----------------|----------------|
| 1.00 | 100% | Perfect match |
| 0.90 | 90% | Excellent match |
| 0.75 | 75% | Very good match |
| 0.60 | 60% | Good match |
| 0.50 | 50% | Moderate match |
| 0.40 | 40% | Fair match |
| 0.30 | 30% | Weak match |
| 0.20 | 20% | Poor match |
| < 0.20 | < 20% | Not relevant |

## UI Display Patterns

### Pattern 1: Percentage Only

Simple, user-friendly:

```
75% relevant
```

```tsx
<span>{result.relevanceScore}%</span>
```

### Pattern 2: Percentage with Similarity (Debug)

Shows both for debugging/power users:

```
75% (sim=0.750)
```

```tsx
<span>
  {result.relevanceScore}% (sim={result.similarity.toFixed(3)})
</span>
```

### Pattern 3: Visual Bar

More intuitive at a glance:

```
[████████░░] 75%
```

```tsx
<div className="relevance-bar">
  <div
    className="relevance-fill"
    style={{ width: `${result.relevanceScore}%` }}
  />
  <span>{result.relevanceScore}%</span>
</div>
```

### Pattern 4: Color-Coded

Green for high, yellow for medium, gray for low:

```tsx
function getRelevanceColor(score: number): string {
  if (score >= 70) return 'text-green-600';
  if (score >= 40) return 'text-yellow-600';
  return 'text-gray-400';
}

<span className={getRelevanceColor(result.relevanceScore)}>
  {result.relevanceScore}%
</span>
```

## Threshold Configuration

Users can adjust the similarity threshold to control strictness:

```
Threshold: 0.5 (default)
├── Stricter (0.7): Only show very similar documents
├── Default (0.5): Show moderately similar documents
└── Looser (0.3): Show weakly similar documents
```

## Implementation

### Python (Cloud Function)

```python
def calculate_relevance(similarity: float) -> int:
    """Convert DOT_PRODUCT similarity to relevance percentage."""
    # DOT_PRODUCT with normalized vectors: -1 to 1
    # For search, we only care about positive similarity
    relevance = similarity * 100
    return max(0, min(100, int(relevance)))
```

### TypeScript (Client)

```typescript
function calculateRelevance(similarity: number): number {
  // DOT_PRODUCT with normalized vectors: -1 to 1
  const relevance = similarity * 100;
  return Math.max(0, Math.min(100, Math.round(relevance)));
}
```

## Comparison: DOT_PRODUCT vs COSINE

| Aspect | DOT_PRODUCT | COSINE |
|--------|-------------|--------|
| Range | -1 to 1 (similarity) | 0 to 2 (distance) |
| Higher = | More similar | Less similar |
| Formula | `similarity * 100` | `(1 - distance/2) * 100` |
| Performance | Faster | Slower |

With normalized vectors (like `gemini-embedding-001` output), both give equivalent rankings, but DOT_PRODUCT is computationally more efficient.

## Testing Relevance Scores

To verify your scoring makes sense:

1. Search for a known document by its exact content
   - Should get 90-100% relevance

2. Search with related but different terms
   - Should get 50-80% relevance

3. Search for completely unrelated content
   - Should get < 30% or no results

If results don't match expectations, adjust the threshold or review embedding quality.

## Asymmetric Search Note

With `gemini-embedding-001`, we use **asymmetric search**:
- Corpus documents use task type: `RETRIEVAL_DOCUMENT`
- Search queries use task type: `RETRIEVAL_QUERY`

This improves search quality because queries and documents have different characteristics. The model is trained to match short queries to longer documents.
