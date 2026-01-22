"""
AI Reranking Module

Utilities for reranking search results using Gemini:
- format_results_for_rerank: Format results for the reranking prompt
- rerank_results: Use Gemini to rerank results based on query intent

Note: This module has no Cloud Function entry points - it's called by search.py.
"""

import json
import os
from typing import Any


def format_results_for_rerank(results: list[dict[str, Any]]) -> str:
    """Format search results for the reranking prompt."""
    formatted = []
    for i, result in enumerate(results):
        formatted.append(
            f"[{i}] {result.get('fileName', 'Unknown')}\n"
            f"    Summary: {result.get('summary', 'No summary')[:200]}...\n"
            f"    Keywords: {', '.join(result.get('keywords', [])[:10])}\n"
            f"    Score: {result.get('weightedScore', 0):.2f} ({result.get('matchType', 'unknown')})"
        )
    return "\n\n".join(formatted)


def rerank_results(
    query: str,
    classification: dict[str, Any],
    results: list[dict[str, Any]],
    limit: int = 10,
) -> list[dict[str, Any]]:
    """
    Use Gemini to rerank search results based on query intent.

    Args:
        query: Original user query
        classification: Query classification with intent/reasoning
        results: Pre-sorted search results (by weightedScore)
        limit: Max results to return after reranking

    Returns:
        Reranked results with rerank scores and explanations
    """
    from google import genai
    from google.genai import types

    if not results:
        return results

    # Get API key from environment
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("[RERANK] No API key, skipping reranking")
        return results[:limit]

    # Create client
    client = genai.Client(vertexai=True, api_key=api_key)

    # Build reranking prompt
    prompt = f"""You are evaluating search results for relevance to a user query.

Query: "{query}"
Query Intent: {classification.get('reasoning', 'Not specified')}
Exact terms to match: {classification.get('exact_match_terms', [])}
Semantic concepts: {classification.get('semantic_search_terms', [])}

Search Results (ranked by similarity score):
{format_results_for_rerank(results)}

For each result, evaluate:
1. Does it directly answer or relate to the query?
2. Does it match any exact terms (part numbers, model numbers)?
3. Does it contain the specific information or concepts requested?
4. Is it the right type of document for this query?

Return a JSON object with:
- "ranked_indices": Array of result indices in order of relevance (most relevant first). Include ALL indices from 0 to {len(results) - 1}.
- "explanations": Object mapping the top 3 indices (as strings) to brief explanations of why they're relevant.
- "confidence": Number 0.0-1.0 indicating confidence in the reranking.

Example response:
{{
  "ranked_indices": [2, 0, 4, 1, 3],
  "explanations": {{
    "2": "Exact match for part number in query",
    "0": "Contains relevant specifications section",
    "4": "Related product in same family"
  }},
  "confidence": 0.85
}}

Return ONLY valid JSON, no markdown or explanation."""

    config = types.GenerateContentConfig(
        temperature=0.1,
        max_output_tokens=2048,
        response_mime_type="application/json",
    )

    try:
        print(f"[RERANK] Reranking {len(results)} results for query: {query[:50]}...")

        response = client.models.generate_content(
            model="gemini-2.0-flash",  # Fast model for reranking
            contents=[types.Content(role="user", parts=[types.Part(text=prompt)])],
            config=config,
        )

        response_text = response.text.strip()
        if response_text.startswith("```"):
            lines = response_text.split("\n")
            response_text = "\n".join(lines[1:-1])

        rerank_response = json.loads(response_text)
        ranked_indices = rerank_response.get("ranked_indices", [])
        explanations = rerank_response.get("explanations", {})
        confidence = rerank_response.get("confidence", 0.5)

        print(f"[RERANK] Reordered indices: {ranked_indices[:5]}... (confidence: {confidence})")

        # Reorder results based on ranked indices
        reranked_results = []
        seen_indices = set()

        for new_rank, original_idx in enumerate(ranked_indices):
            if original_idx >= len(results) or original_idx in seen_indices:
                continue
            seen_indices.add(original_idx)

            result = results[original_idx].copy()
            result["rerankPosition"] = new_rank
            result["originalPosition"] = original_idx
            result["rerankExplanation"] = explanations.get(str(original_idx), None)
            reranked_results.append(result)

        # Add any results not included in reranking (shouldn't happen, but safety)
        for i, result in enumerate(results):
            if i not in seen_indices:
                result_copy = result.copy()
                result_copy["rerankPosition"] = len(reranked_results)
                result_copy["originalPosition"] = i
                reranked_results.append(result_copy)

        print(f"[RERANK] Returning {min(limit, len(reranked_results))} reranked results")
        return reranked_results[:limit]

    except Exception as e:
        print(f"[RERANK] Error during reranking: {e}")
        # Fall back to original order on error
        return results[:limit]
