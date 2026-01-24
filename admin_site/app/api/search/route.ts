/**
 * Search API
 *
 * POST /api/search - Perform agentic search across collections
 */

import { NextRequest, NextResponse } from "next/server";
import { classifyAndSearch } from "@/lib/firebase/functions";
import type { SearchResponse } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      query,
      limit = 10,
      threshold = 0.25,
      model = "gemini-2.5-pro",
      thinkingLevel = "LOW",
      debugMode = false,
      enableRerank = true,
    } = body;

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "Query is required" },
        { status: 400 }
      );
    }

    // Call the Cloud Function which handles classification AND vector search
    const result = await classifyAndSearch(query, limit, threshold, model, thinkingLevel, debugMode, enableRerank);

    const response: SearchResponse = {
      results: result.results,
      classification: result.classification,
      searchMetadata: result.searchMetadata,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Search error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Search failed: ${message}` },
      { status: 500 }
    );
  }
}
