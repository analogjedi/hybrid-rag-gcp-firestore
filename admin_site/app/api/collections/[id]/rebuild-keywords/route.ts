/**
 * Rebuild Keywords API
 *
 * POST /api/collections/[id]/rebuild-keywords
 *
 * Rebuilds the aggregated document keywords for a collection.
 * This scans all documents and rebuilds keyword frequency counts,
 * which are used by the classifier to route queries correctly.
 */

import { NextRequest, NextResponse } from "next/server";
import { rebuildCollectionKeywords } from "@/lib/firebase/functions";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: collectionId } = await params;

    if (!collectionId) {
      return NextResponse.json(
        { error: "collectionId is required" },
        { status: 400 }
      );
    }

    console.log(`[REBUILD KEYWORDS] Starting for collection: ${collectionId}`);

    const result = await rebuildCollectionKeywords(collectionId);

    console.log(
      `[REBUILD KEYWORDS] Complete: ${result.documentsScanned} docs, ${result.uniqueKeywords} keywords`
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Rebuild keywords error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Rebuild keywords failed: ${message}` },
      { status: 500 }
    );
  }
}
