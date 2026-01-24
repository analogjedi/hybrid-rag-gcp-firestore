/**
 * Embed Elements API
 *
 * POST /api/embed-elements - Generate embeddings for document elements (tables, figures, images)
 */

import { NextRequest, NextResponse } from "next/server";
import { generateElementEmbeddingsForDocument } from "@/lib/firebase/functions";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { collectionId, documentId } = body;

    if (!collectionId || !documentId) {
      return NextResponse.json(
        { error: "collectionId and documentId are required" },
        { status: 400 }
      );
    }

    const result = await generateElementEmbeddingsForDocument(collectionId, documentId);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Element embedding error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Element embedding failed: ${message}` },
      { status: 500 }
    );
  }
}
