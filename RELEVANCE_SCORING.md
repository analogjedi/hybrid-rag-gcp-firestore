# Relevance Scoring

This document explains how cosine distance is converted to human-readable relevance percentages.

## The Problem

Firestore's `find_nearest()` returns a **cosine distance** value:
- `0.0` = Identical vectors (perfect match)
- `2.0` = Completely opposite vectors

But users don't think in terms of "cosine distance 0.187" - they think in terms of "75% relevant."

## The Solution

Convert distance to a percentage using a **baseline distance** where relevance becomes 0%.

```python
BASELINE_DISTANCE = 0.4
relevance_score = max(0, min(100, int((1 - distance / BASELINE_DISTANCE) * 100)))
```

## Why 0.4 as Baseline?

After experimentation with semantic text embeddings:

| Distance | Meaning | Example |
|----------|---------|---------|
| 0.0 | Identical text | Same document |
| 0.1 | Very similar | Same topic, minor wording differences |
| 0.2 | Similar | Related concepts, good match |
| 0.3 | Somewhat related | Same domain, different focus |
| 0.4+ | Weakly related or unrelated | Different topics |

Setting baseline at 0.4 means:
- Documents with distance 0.2 get 50% relevance (good match)
- Documents with distance 0.4+ get 0% (filtered out)
- This matches human perception of "relevant vs not"

## Conversion Table

| Distance | Relevance Score | Interpretation |
|----------|-----------------|----------------|
| 0.00 | 100% | Perfect match |
| 0.05 | 88% | Excellent match |
| 0.10 | 75% | Very good match |
| 0.15 | 63% | Good match |
| 0.20 | 50% | Moderate match |
| 0.25 | 38% | Fair match |
| 0.30 | 25% | Weak match |
| 0.35 | 13% | Poor match |
| 0.40+ | 0% | Not relevant |

## UI Display Patterns

### Pattern 1: Percentage Only

Simple, user-friendly:

```
75% relevant
```

```tsx
<span>{result.relevanceScore}%</span>
```

### Pattern 2: Percentage with Distance (Debug)

Shows both for debugging/power users:

```
75% (d=0.100)
```

```tsx
<span>
  {result.relevanceScore}% (d={result.distance.toFixed(3)})
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

Users can adjust the distance threshold to control strictness:

```
Threshold: 0.5 (default)
├── Stricter (0.2): Only show very similar documents
├── Default (0.5): Show moderately similar documents
└── Looser (0.8): Show weakly similar documents
```

### Threshold vs Baseline

These are different concepts:
- **Baseline (0.4)**: Fixed constant for relevance % calculation
- **Threshold (configurable)**: Cutoff for which results to include

A document with distance 0.5 would get:
- Relevance: 0% (because 0.5 > 0.4 baseline)
- But still included if threshold >= 0.5

## Alternative Formulas

### Linear (Current)

```python
relevance = (1 - distance / 0.4) * 100
```

Simple, easy to understand.

### Exponential Decay

```python
relevance = math.exp(-distance * 5) * 100
```

More aggressive dropoff. Distances of 0.5+ are nearly 0%.

### Sigmoid

```python
relevance = 100 / (1 + math.exp((distance - 0.2) * 20))
```

Smooth transition around a center point (0.2 in this case).

### Recommendation

Use **linear** for simplicity. Only consider alternatives if:
- Users complain about score distribution
- You have domain-specific requirements

## Adjusting the Baseline

If 0.4 doesn't work for your domain:

1. **Collect sample distances** from real searches
2. **Identify the "acceptable match" threshold** from user feedback
3. **Set baseline** slightly above that threshold

For example, if users consider distance 0.3 the cutoff for "good enough":
- Set baseline to 0.35 or 0.4
- Anything at 0.3 gets ~25-15% relevance

## Implementation

### Python (Cloud Function)

```python
def calculate_relevance(distance: float) -> int:
    """Convert cosine distance to relevance percentage."""
    BASELINE = 0.4
    relevance = (1 - distance / BASELINE) * 100
    return max(0, min(100, int(relevance)))
```

### TypeScript (Client)

```typescript
function calculateRelevance(distance: number): number {
  const BASELINE = 0.4;
  const relevance = (1 - distance / BASELINE) * 100;
  return Math.max(0, Math.min(100, Math.round(relevance)));
}
```

## Testing Relevance Scores

To verify your scoring makes sense:

1. Search for a known document by its exact content
   - Should get 90-100% relevance

2. Search with related but different terms
   - Should get 40-70% relevance

3. Search for completely unrelated content
   - Should get 0-20% or no results

If results don't match expectations, adjust the baseline.
