/**
 * Processing API
 *
 * POST /api/process - Process documents in a collection
 *
 * Body:
 * - collectionId: string (required)
 * - action: "process" | "embed" | "full" (default: "full")
 * - limit: number (default: 10)
 * - documentId: string (optional - for single document processing)
 */

import { NextRequest, NextResponse } from "next/server";
import {
  processDocument,
  processPendingDocuments,
  generateDocumentEmbedding,
  generateEmbeddingsForReadyDocs,
} from "@/lib/firebase/functions";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      collectionId,
      action = "full",
      limit = 10,
      documentId,
    } = body as {
      collectionId: string;
      action?: "process" | "embed" | "full";
      limit?: number;
      documentId?: string;
    };

    if (!collectionId) {
      return NextResponse.json(
        { error: "collectionId is required" },
        { status: 400 }
      );
    }

    // Single document processing
    if (documentId) {
      console.log(`Processing single document ${documentId}...`);
      const processResult = await processDocument(collectionId, documentId);

      if (action === "full" && processResult.success) {
        console.log(`Generating embedding for ${documentId}...`);
        const embedResult = await generateDocumentEmbedding(
          collectionId,
          documentId
        );
        return NextResponse.json({
          success: true,
          metadata: processResult.metadata,
          elementsCreated: processResult.elementsCreated,
          processing: processResult,
          embedding: embedResult,
        });
      }

      return NextResponse.json({
        success: processResult.success,
        metadata: processResult.metadata,
        elementsCreated: processResult.elementsCreated,
        processing: processResult,
      });
    }

    // Batch processing
    const results: {
      success: boolean;
      processing?: {
        processed: number;
        errors: number;
        details: Array<{ documentId: string; success: boolean; error?: string }>;
      };
      embedding?: {
        processed: number;
        errors: number;
        details: Array<{ documentId: string; success: boolean; error?: string }>;
      };
    } = { success: true };

    if (action === "process" || action === "full") {
      console.log(`Processing ${limit} pending documents in ${collectionId}...`);
      results.processing = await processPendingDocuments(collectionId, limit);
    }

    if (action === "embed" || action === "full") {
      console.log(`Generating embeddings for ready docs in ${collectionId}...`);
      results.embedding = await generateEmbeddingsForReadyDocs(
        collectionId,
        limit
      );
    }

    results.success =
      (results.processing?.errors ?? 0) === 0 &&
      (results.embedding?.errors ?? 0) === 0;

    return NextResponse.json(results);
  } catch (error) {
    console.error("Processing error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Processing failed: ${message}` },
      { status: 500 }
    );
  }
}
