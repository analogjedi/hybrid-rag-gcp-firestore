/**
 * Upload API
 *
 * POST /api/upload - Upload a file to Cloud Storage and create document record
 *
 * Query params:
 * - process=true - Also trigger Gemini analysis (default: false)
 * - embed=true - Also generate embedding after analysis (default: false)
 */

import { NextRequest, NextResponse } from "next/server";
import { uploadFile } from "@/lib/firebase/storage";
import { createDocument } from "@/lib/firebase/documents";
import {
  processDocument,
  generateDocumentEmbedding,
} from "@/lib/firebase/functions";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const url = new URL(request.url);
    const shouldProcess = url.searchParams.get("process") === "true";
    const shouldEmbed = url.searchParams.get("embed") === "true";

    const file = formData.get("file") as File | null;
    const collectionId = formData.get("collectionId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    if (!collectionId) {
      return NextResponse.json(
        { error: "collectionId is required" },
        { status: 400 }
      );
    }

    // Validate file type
    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Only PDF and Word documents are supported" },
        { status: 400 }
      );
    }

    // Convert File to Buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Upload to Cloud Storage
    const { storagePath } = await uploadFile(
      collectionId,
      file.name,
      buffer,
      file.type
    );

    // Create document record in Firestore
    const document = await createDocument({
      collectionId,
      storagePath,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
    });

    const response: {
      success: boolean;
      document: typeof document;
      processing?: { success: boolean; metadata?: unknown; error?: string };
      embedding?: { success: boolean; error?: string };
    } = {
      success: true,
      document,
    };

    // Optionally trigger Gemini analysis
    if (shouldProcess) {
      try {
        console.log(`Triggering Gemini analysis for ${document.id}...`);
        const processResult = await processDocument(collectionId, document.id);
        response.processing = processResult;

        // Optionally generate embedding after successful analysis
        if (shouldEmbed && processResult.success) {
          console.log(`Generating embedding for ${document.id}...`);
          const embedResult = await generateDocumentEmbedding(
            collectionId,
            document.id
          );
          response.embedding = embedResult;
        }
      } catch (processError) {
        console.error("Processing error:", processError);
        response.processing = {
          success: false,
          error:
            processError instanceof Error
              ? processError.message
              : "Processing failed",
        };
      }
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error uploading file:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to upload file: ${message}` },
      { status: 500 }
    );
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};
