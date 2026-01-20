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

### Pattern 5: Debug Mode Score Breakdown

When debug mode is enabled, show individual scores for each search permutation:

```
Combined Score ████████████████████ 95%

Score Breakdown:
  ✓ Exact "AHV85003"    ████████████████████ 95%
  ◈ "SiC driver"        ████████████░░░░░░░░ 62%  (sim=0.560)
  ◈ "gate driver"       ███████████░░░░░░░░░ 58%  (sim=0.540)
  ⌕ Full query          █████████████░░░░░░░ 66%  (sim=0.580)
```

```tsx
{result.scoreBreakdown && (
  <div className="score-breakdown">
    <p>Score Breakdown:</p>

    {/* Exact matches */}
    {result.scoreBreakdown.exactMatches.map(match => (
      <ScoreRow
        icon="✓"
        label={`Exact "${match.term}"`}
        score={match.matched ? 95 : 0}
      />
    ))}

    {/* Semantic term scores */}
    {result.scoreBreakdown.semanticScores.map(score => (
      <ScoreRow
        icon="◈"
        label={`"${score.term}"`}
        score={Math.round(score.score * 100)}
        similarity={score.similarity}
      />
    ))}

    {/* Full query score */}
    {result.scoreBreakdown.fullQueryScore && (
      <ScoreRow
        icon="⌕"
        label="Full query"
        score={Math.round(result.scoreBreakdown.fullQueryScore.score * 100)}
        similarity={result.scoreBreakdown.fullQueryScore.similarity}
      />
    )}
  </div>
)}
```

This pattern helps identify:
- Whether exact keyword matching found the document
- Which semantic terms contributed most to the score
- How the full query compares to individual terms

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

The basic formula maps similarity directly to percentage:

```python
def calculate_relevance_basic(similarity: float) -> int:
    """Convert DOT_PRODUCT similarity to relevance percentage."""
    relevance = similarity * 100
    return max(0, min(100, int(relevance)))
```

For better score differentiation, we scale the practical range (0.25-0.75) to 0-100%:

```python
def calculate_relevance_score(similarity: float | None) -> float:
    """
    Enhanced scoring with better differentiation.

    Scales the practical similarity range [0.25, 0.75] to [0%, 100%]:
    - 0.75+ similarity → 100% (excellent match)
    - 0.50 similarity → 50% (moderate match)
    - 0.25 similarity → 0% (poor match)
    """
    if similarity is None:
        return 0.0
    return max(0.0, min(1.0, (similarity - 0.25) / 0.5))
```

### TypeScript (Client)

```typescript
function calculateRelevanceScore(similarity: number | null): number {
  if (similarity === null) return 0;
  // Scale [0.25, 0.75] to [0, 1]
  return Math.max(0, Math.min(1, (similarity - 0.25) / 0.5));
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
