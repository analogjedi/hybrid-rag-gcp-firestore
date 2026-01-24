/**
 * Embed API
 *
 * POST /api/embed - Generate embedding for a document
 */

import { NextRequest, NextResponse } from "next/server";
import { generateDocumentEmbedding } from "@/lib/firebase/functions";

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

    const result = await generateDocumentEmbedding(collectionId, documentId);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Embed error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Embedding failed: ${message}` },
      { status: 500 }
    );
  }
}
